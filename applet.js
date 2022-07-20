// Cinn'r eyes applet for Cinnamon DE, © Drugwash 2022.06.17
// Adapted from the Glasa extension for Gnome created by Markus Pawellek AKA lyrahgames
// Original Gnome version here:  https://github.com/lyrahgames/gnome-extension-glasa
// Licensed under GNU Public License v3

const Applet = imports.ui.applet;
const AppletManager = imports.ui.appletManager;
const Settings = imports.ui.settings;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Lang = imports.lang;
const Gdk = imports.gi.Gdk;				// for cursor shake
const Main = imports.ui.main;			// for workspace name
const Util = imports.misc.util;			// for the timeout
const Ext = imports.ui.extension;		// for path and icon theme

// translation-related
const UUID = "cinn-r-eyes@drugwash";
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
	return Gettext.dgettext(UUID, str);
}

const UP = Clutter.ScrollDirection.UP;
const DOWN = Clutter.ScrollDirection.DOWN;
const PRECMND = "dbus-send --dest=org.Cinnamon --print-reply /org/Cinnamon org.Cinnamon.Show";
const TTIP = _("I'm watching your <b>every move</b> !");
var WSTXT = _("Current workspace");
var TTTXT;

function SinnerEyes(metadata, orientation, panel_height, instance_id) {
	this._init(metadata, orientation, panel_height, instance_id);
};
//=============================================================================
SinnerEyes.prototype = {
	__proto__: Applet.Applet.prototype,	// alternative

	_init: function(metadata, orientation, panel_height, instance_id) {
		Applet.Applet.prototype._init.call(this, orientation, panel_height, instance_id);
		if (Applet.hasOwnProperty("AllowedLayout"))
			this.setAllowedLayout(Applet.AllowedLayout.BOTH);
		this._meta = metadata; this._uuid = metadata.uuid; this.height = panel_height;
		this.orientation = orientation; this.instance_id = instance_id;
		this.settings = new Settings.AppletSettings(this, metadata.uuid, instance_id);
		this.appdir = this._get_appdir();	// example of local method usage
		this._wsInfo();
		this.shake = this.timeout = null;
		this.color0 = new Clutter.Color({red: 255, green: 255, blue:240, alpha: 255}); // Clutter.Color.new(r, g, b, a);
		this.color3 = new Clutter.Color({red: 0, green: 0, blue:0, alpha: 255}); // black

		this.settings.bind("eyeline-width", "eyelineW", this._rebuild, null);
		this.settings.bind("relief-factor", "reliefF", this._rebuild, null);
		this.settings.bind("relief-factor-bound", "reliefFB", this._rebuild, null);
		this.settings.bind("iris-move", "irisMv", this._rebuild, null);
		this.settings.bind("iris-size", "irisSz", this._rebuild, null);
		this.settings.bind("iris-color", "irisClr", this._rebuild, null);
		this.settings.bind("eyebrow-scale", "eyebrowS", this._rebuild, null);
		this.settings.bind("icon-size", "iconSz", this._rebuild, null);
		this.settings.bind("custom-size", "customSz", this._rebuild, null);
		this.settings.bind("is-enabled", "isEnabled", this.toggle, null);
		this.settings.bind("spooky", "spooky", null, null);
		this.settings.bind("expo-toggle", "expo", null, null);
		this.settings.bind("ws-switch", "wsSwitch", null, null);
		this.settings.bind("ws-tip", "wsTip", this.setTip, null);

//		this.<element/widget>.connect('<signal-name>', Lang.bind(this, this.<functionName>));
		global.screen.connect('notify::n-workspaces', Lang.bind(this, this._defTT));
		global.screen.connect('workareas-changed', Lang.bind(this, this._defTT));
		global.window_manager.connect('switch-workspace', this._defTT.bind(this));
		
		this.setTip(this.wsTip);
		this.createIcon(null);
		this.toggle();
	},

	_get_appdir: function() {
		var type = Ext.Type["APPLET"]
		let dir = Ext.findExtensionDirectory(this._uuid, type.userDir, type.folder);
		let dirP = dir.get_path();
//		let iconDir = dir.get_child("icons"); let idirP = iconDir.get_path();
//		Gtk.IconTheme.get_default().append_search_path(idirP);
		return dirP + "/";
	},

	createIcon: function(icon) {
		if (icon) this.actor.destroy_all_children();
		let size = this.customSz ?
			this.iconSz : this.getPanelIconSize(St.IconType.FULLCOLOR);
		this.icon = new St.DrawingArea({ width: 1.7 * size, height: size });
		this._repainter= this.icon.connect('repaint', Lang.bind(this, this._repaint));
		let eyebox = new St.Bin({ style: 'padding: 0px; margin: 0px;', reactive: true });
		eyebox.child = this.icon;
		this.actor.add(eyebox);
		eyebox.connect('scroll-event', Lang.bind(this, this.onScroll));
		this.color2 = Clutter.Color.from_string(this.irisClr)[1];
	},

	_repaint: function() {
		let disp = Gdk.Display.get_default();
		let screen = disp.get_default_screen();
//		let sw = screen.get_width();
		let sh = screen.get_height(); let nx, ny, inAreaX, inAreaY, cent;

		let halfsize = this.icon.height / 2 - 2;
		let halfwidth = this.icon.width / 2;
		let [area_x, area_y] = this.icon.get_transformed_position();
		let [mouse_x, mouse_y, mask] = global.get_pointer();

		let eye_radius = 2 * halfsize / (1.2 + this.eyebrowS);
		let eyebrow_radius = this.eyebrowS * (eye_radius+1);
		eye_radius -= this.eyelineW / 2;
		eyebrow_radius -= this.eyelineW / 2;
		let center_y = halfsize * (this.eyebrowS + 1) / 2;
		let left_center_x = halfwidth - eye_radius;
		let right_center_x = halfwidth + eye_radius;

		mouse_x -= area_x + halfwidth;
		mouse_y -= area_y + center_y;
//		let bpos = Math.abs((mouse_y - sh) / (2 * sh));
		let bpos = Math.abs((mouse_y - sh) / ((4-2*(sh-area_y + center_y)/sh) * sh));

		let factor = Math.sqrt(mouse_x * mouse_x + mouse_y * mouse_y) /
		(this.reliefF * eye_radius);
		if (factor > this.reliefFB) factor = this.reliefFB;
		let iris_move = eye_radius * this.irisMv * factor;

		// Get and set up the Cairo context.
		let cr = this.icon.get_context();
		let theme_node = this.icon.get_theme_node();
		let color1 = theme_node.get_foreground_color();
		Clutter.cairo_set_source_color(cr, color1);

		cr.setLineWidth(this.eyelineW);
		cr.save();

		// Draw the left eye.
		cr.translate(left_center_x, center_y);
		cr.arc(0, 0, eye_radius, 0, 2 * Math.PI);
		Clutter.cairo_set_source_color(cr, this.color0);
		cr.fill();
		Clutter.cairo_set_source_color(cr, color1);
		cr.arc(0, 0, eye_radius, 0, 2 * Math.PI);
		cr.stroke();
		// Draw the left eyebrow.
		if (!this.spooky)
			cr.arc(0, 0, eyebrow_radius, 5 * Math.PI / 4, 6.5 * Math.PI / 4);
		else
			cr.arc(0, 3*bpos, eyebrow_radius, (5+bpos) * Math.PI / 4, (6.42+bpos) * Math.PI / 4);
		cr.stroke();
		// Draw the left iris/pupil.
		if (!this.spooky) {
			cr.rotate(Math.PI / 2 - Math.atan2(mouse_x, mouse_y));
			cr.translate(iris_move, 0);
		}
		else {
            inAreaX = mouse_x >= -halfwidth && mouse_x < halfwidth ? true : false;
			nx = inAreaX ? 100 : mouse_x;
			ny = mouse_y*bpos;
			cr.rotate(Math.PI / 2 - Math.atan2(nx, ny));
			cr.translate(iris_move*bpos*1.6, 0);
		}
		cr.scale(Math.cos(factor), 1);
		cr.arc(0, 0, eye_radius * this.irisSz, 0, 2 * Math.PI);
		Clutter.cairo_set_source_color(cr, this.color2);
		cr.fill();
		if (this.spooky) {
			cr.scale(Math.cos(factor)/1.2, 1/1.4);
			cr.arc(0, 0, eye_radius * this.irisSz/1.6, 0, 2 * Math.PI);
			Clutter.cairo_set_source_color(cr, this.color3);
			cr.fill();
		}
		cr.restore();
		cr.save();
		// Draw the right eye;
		Clutter.cairo_set_source_color(cr, color1);
		cr.translate(right_center_x, center_y);
		cr.arc(0, 0, eye_radius, 0, 2 * Math.PI);
		Clutter.cairo_set_source_color(cr, this.color0);
		cr.fill();
		Clutter.cairo_set_source_color(cr, color1);
		cr.arc(0, 0, eye_radius, 0, 2 * Math.PI);
		cr.stroke();
		// Draw the right eyebrow.
		Clutter.cairo_set_source_color(cr, color1);
		if (!this.spooky)
			cr.arc(0, 0, eyebrow_radius, 5.5 * Math.PI / 4, 7 * Math.PI / 4);
		else
			cr.arc(0, 3*bpos, eyebrow_radius, (5.58-bpos) * Math.PI / 4, (7-bpos) * Math.PI / 4);
		cr.stroke();
		// Draw the right iris/pupil.
		if (!this.spooky) {
			cr.rotate(Math.PI / 2 - Math.atan2(mouse_x, mouse_y));
			cr.translate(iris_move, 0);
		}
		else {
			nx = inAreaX ? -100 : mouse_x;
			ny = mouse_y*bpos;
			cr.rotate(Math.PI / 2 - Math.atan2(nx, ny));
			cr.translate(iris_move*bpos*1.6, 0);
		}
		cr.scale(Math.cos(factor), 1);
		cr.arc(0, 0, eye_radius * this.irisSz, 0, 2 * Math.PI);
		Clutter.cairo_set_source_color(cr, this.color2);
		cr.fill();
		if (this.spooky) {
			cr.scale(Math.cos(factor)/1.2, 1/1.4);
			cr.arc(0, 0, eye_radius * this.irisSz/1.6, 0, 2 * Math.PI);
			Clutter.cairo_set_source_color(cr, this.color3);
			cr.fill();
		}
		cr.restore();
	},

	enable: function(active=true) {
		if (active && !this.timeout)
			this.timeout = Util.setInterval(() => this.icon.queue_repaint(), 50);
		else if (!active && this.timeout) {
			Util.clearInterval(this.timeout);
			this.timeout = null;
		}
	},

	toggle: function() {
		this.enable(this.isEnabled);
	},

	_rebuild: function() {
		this.enable(false);
		this.createIcon(this.icon);
		this.enable(this.isEnabled);
	},
// I added a reset() method to my 19.2 system and it works fine;
// why the hell wasn't this implemented by default ?!?
// /usr/share/cinnamon/js/ui/settings.js
	_resetVal: function() {
		try {
			this.settings.reset("eyeline-width");
			this.settings.reset("relief-factor");
			this.settings.reset("relief-factor-bound");
			this.settings.reset("iris-move");
			this.settings.reset("iris-size");
//			this.settings.reset("iris-color"); // I see no need to reset this too
			this.settings.reset("eyebrow-scale");
		} catch(e) {
			this._reset("eyeline-width");
			this._reset("relief-factor");
			this._reset("relief-factor-bound");
			this._reset("iris-move");
			this._reset("iris-size");
//			this._reset("iris-color"); // I see no need to reset this too
			this._reset("eyebrow-scale");
			global.logWarning("Used workaround for g_settings_reset() !");
		}
	},

	_reset: function(key) {
		let def = this.settings.getDefaultValue(key);
		if (def === null) return;
		this.settings.setValue(key, def);
	},

	onScroll: function(actor, event) {
		let direction = event.get_scroll_direction();
		let mod2 = event.get_state() & 4;	// test for <Ctrl> down
		if (this.shake !== null) { Util.clearInterval(this.shake); this.shake = null; }
		if (this.deftip !== null) { Util.clearInterval(this.deftip); this.deftip = null; }
		if (this.customSz == true && !mod2) {
			let sz = this.iconSz; let iMin, iMax;
// Locally I have a way to read min/max from 'icon-size' settings;
// for unfortunate users we use hardcoded limits: 8px (10-2) min, panel_height-2 max.
// We use [val]-2 because drawing area is 2px larger than actual image.
			try {
				sz = direction == DOWN ? this.iconSz+1 :
					direction == UP ? this.iconSz-1 : this.iconSz;
				[iMin, iMax] = this.settings.getRange("icon-size");
				let inRange = this.settings.rangeCheck("icon-size", sz);
				if (sz != this.iconSz && inRange) {this.iconSz = sz; this._rebuild();}
				else return;
			} catch(e) {
				iMin = 10; iMax = this.height - 2;
				if (direction == DOWN && this.iconSz < iMax) this.iconSz++;
				else if (direction == UP && this.iconSz > iMin) this.iconSz--;
				if (sz != this.iconSz) this._rebuild();
				else return;
			}
			TTTXT = _("Icon size") + " <b>" + this.iconSz.toString() +
				"</b> px.\n" + _("Min") + ": <b>" + iMin.toString() +
				"</b> px, " + _("Max") + ": <b>" + iMax.toString() +
				"</b> px.";
		} else if (this.wsSwitch && mod2) {
			let ws = global.screen.get_workspace_by_index(this._wsInfo(direction));
			ws.activate(global.get_current_time());
		} else { this.shake = this.deftip = null; return; }
		this.setTip(2);
		this.shake = Util.setInterval(() => this._shakeCursor(), 200);
		this.deftip = Util.setInterval(() => this._defTT(), 4500);
	},
// function below borrowed from my betterlockPlus applet
	_shakeCursor: function() {
		Util.clearInterval(this.shake); this.shake = null;
		let dev, mx, my, scr;
		let disp = Gdk.Display.get_default();
		try {
			let seat = disp.get_default_seat();
			dev = seat.get_pointer();
		}catch(e) {
			let devman = disp.get_device_manager();
			dev = devman.get_client_pointer();
		}
		[scr, mx, my] = dev.get_position(); 
		dev.warp(scr, mx+5, my);
		dev.warp(scr, mx, my);
	},

	_wsInfo: function(dir=null) {
		let count = global.screen.get_n_workspaces();
		let idx = global.screen.get_active_workspace_index();
		if (dir == DOWN && idx < count-1) idx++;
		else if (dir == UP && idx > 0) idx--;
		let wn = Main.getWorkspaceName(idx);
		let pos = " (" + (idx+1).toString() + "/" + count.toString() + ")";
		TTTXT = WSTXT + pos + ": <b>" + wn + "</b>";
		return idx;
	},

	_defTT: function() {
		Util.clearInterval(this.deftip); this.deftip = null;
		this._wsInfo();
		this.setTip(this.wsTip);
	},

	setTip: function(mode=null) {
		mode = mode === null ? this.wsTip : mode;
		let txt = "<span>" + (mode == 2 ? TTTXT : mode ? TTTXT + "\n" + TTIP : TTIP) + "</span>";
// Yes, twice, because Cinnamon is buggy !
		this._applet_tooltip._tooltip.clutter_text.set_markup(txt);
		this._applet_tooltip._tooltip.clutter_text.set_markup(txt);
	},

	onHover: function(actor, event) {
// do something when icon is hovered
	},
	
// default methods
	on_applet_clicked: function(event) {
//		let mod1 = event.get_state() & 1;	// test for <Shift> down
		let mod2 = event.get_state() & 4;	// test for <Ctrl> down
//		let mod3 = event.get_state() & 64;	// test for <Super/Win> down
		let cmnd = (this.expo && !mod2) || (!this.expo && mod2) ? "Expo" : "Overview";
		Util.spawnCommandLine(PRECMND + cmnd);
	},

	on_panel_icon_size_changed: function() {
// do something with new icon sizes
		this._rebuild();
	},

	on_panel_height_changed: function() {
		this.height = this._panelHeight;
// do something
		if (this.height < this.iconSz) this._rebuild();
	},

	on_orientation_changed: function(orient) {
		this.orient = (orient == St.Side.LEFT || orient == St.Side.RIGHT) ? 1 : 0;
// do something
	},

	on_applet_removed_from_panel: function() {
//		module.disconnect(this.signalId);
		this.enable(false);
		this.settings.finalize();
	},

	on_applet_reloaded: function() {
// do something
	}
};
//=============================================================================
function main(metadata, orientation, panel_height, instance_id) {
	return new SinnerEyes(metadata, orientation, panel_height, instance_id);
}
// End Of File

