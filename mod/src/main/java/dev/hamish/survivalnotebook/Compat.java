package dev.hamish.survivalnotebook;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.ConfirmLinkScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemStack;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Every call into Minecraft that is likely to be renamed between versions lives here, so a version bump only ever needs this
 * one small file fixed. (Item drawing, item lookup and opening links.)
 */
final class Compat {
	private Compat() { }

	private static final Map<String, ItemStack> STACKS = new HashMap<>();

	/** The item with this id path (e.g. "diamond_sword"), or EMPTY if there's no such item. Cached. */
	static ItemStack stack(String path) {
		if (path == null || path.isBlank()) return ItemStack.EMPTY;
		return STACKS.computeIfAbsent(path, p -> {
			try {
				var item = BuiltInRegistries.ITEM.getValue(Identifier.withDefaultNamespace(p));
				ItemStack s = new ItemStack(item);
				return s.isEmpty() ? ItemStack.EMPTY : s;
			} catch (RuntimeException e) { return ItemStack.EMPTY; }
		});
	}

	/** Makes a vanilla button fully transparent (it still takes clicks), so no texture or corner pixels show around our own painting. */
	static void invisible(Object widget) {
		try { widget.getClass().getMethod("setAlpha", float.class).invoke(widget, 0f); } catch (ReflectiveOperationException | RuntimeException | LinkageError ignored) { }
	}

	/** Plays a vanilla UI sound by its SoundEvents field name (e.g. "UI_TOAST_IN"). Silent if the sound or the call isn't there. */
	static void sound(String field, float pitch) {
		if (!NbConfig.get().sounds) return;
		try {
			Class<?> events = Class.forName("net.minecraft.sounds.SoundEvents");
			Object ev = events.getField(field).get(null);
			Class<?> evClass = Class.forName("net.minecraft.sounds.SoundEvent");
			if (!evClass.isInstance(ev)) ev = Class.forName("net.minecraft.core.Holder").getMethod("value").invoke(ev);   // some sounds are held in a Holder
			Class<?> inst = Class.forName("net.minecraft.client.resources.sounds.SimpleSoundInstance");
			Object si = inst.getMethod("forUI", evClass, float.class).invoke(null, ev, pitch);
			Minecraft mc = Minecraft.getInstance();
			Object mgr = mc.getClass().getMethod("getSoundManager").invoke(mc);
			Class<?> siIface = Class.forName("net.minecraft.client.resources.sounds.SoundInstance");
			mgr.getClass().getMethod("play", siIface).invoke(mgr, si);
		} catch (ReflectiveOperationException | RuntimeException | LinkageError ignored) { }
	}
	static void soundTab() { sound("BOOK_PAGE_TURN", 1.1f); }
	static void soundSaved() { sound("EXPERIENCE_ORB_PICKUP", 1.2f); }
	static void soundDeleted() { sound("ITEM_BREAK", 1.0f); }
	static void soundError() { sound("VILLAGER_NO", 1.0f); }
	static void soundToggle() { sound("LEVER_CLICK", 1.0f); }

	/** {uuid, name} of the logged-in Minecraft account, or null. */
	static String[] account() {
		try {
			Minecraft mc = Minecraft.getInstance();
			Object user = mc.getClass().getMethod("getUser").invoke(mc);
			Object id = user.getClass().getMethod("getProfileId").invoke(user), nm = user.getClass().getMethod("getName").invoke(user);
			return new String[] {String.valueOf(id), String.valueOf(nm)};
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) { return null; }
	}

	/** Starts a new drawing layer above everything painted so far (if this version has one), so what follows can't be covered. */
	static void above(GuiGraphicsExtractor g) {
		try { g.getClass().getMethod("nextStratum").invoke(g); } catch (ReflectiveOperationException | RuntimeException | LinkageError ignored) { }
	}

	/** Draws the vanilla 16x16 item icon. Draws nothing for unknown items. */
	static void drawItem(GuiGraphicsExtractor g, String path, int x, int y) {
		ItemStack s = stack(path);
		if (!s.isEmpty()) g.item(s, x, y);
	}

	private static List<String> ALL_ITEMS;

	/** Every item id (without "minecraft:") in alphabetical order, for the icon picker. Cached. */
	static synchronized List<String> allItemIds() {
		if (ALL_ITEMS != null) return ALL_ITEMS;
		java.util.TreeSet<String> out = new java.util.TreeSet<>();
		try {
			for (Object id : BuiltInRegistries.ITEM.keySet()) {
				String s = String.valueOf(id);
				if (s.startsWith("minecraft:")) s = s.substring(10);
				if (!s.isEmpty() && !s.equals("air") && !s.contains(":")) out.add(s);
			}
		} catch (RuntimeException | LinkageError ignored) { }
		ALL_ITEMS = new java.util.ArrayList<>(out);
		return ALL_ITEMS;
	}

	/** Puts text on the clipboard (by reflection, so a rename in a future version can't break the build). */
	static boolean copy(String text) {
		try {
			Minecraft mc = Minecraft.getInstance();
			Object kh = Minecraft.class.getField("keyboardHandler").get(mc);
			kh.getClass().getMethod("setClipboard", String.class).invoke(kh, text);
			return true;
		} catch (ReflectiveOperationException | RuntimeException e) { return false; }
	}

	/** Gives a text box keyboard focus (used to keep typing in a search box after the screen rebuilds). */
	static void focus(Screen screen, net.minecraft.client.gui.components.EditBox box) {
		try { box.setFocused(true); screen.setFocused(box); } catch (RuntimeException ignored) { }
	}

	/** Asks "Open this link?" (vanilla's own confirmation) and then opens it in the browser. */
	static void openUrl(Screen parent, String url) {
		Minecraft.getInstance().execute(() -> ConfirmLinkScreen.confirmLinkNow(parent, java.net.URI.create(url)));
	}

	static void setScreen(Screen s) { Minecraft mc = Minecraft.getInstance(); mc.execute(() -> mc.gui.setScreen(s)); }

	/**
	 * A big multi-line text box (vanilla's MultiLineEditBox), created by reflection so a rename in a future Minecraft version can't
	 * break the build. Returns null if it isn't available, and the caller falls back to a line-by-line editor.
	 */
	static net.minecraft.client.gui.components.AbstractWidget multiLine(net.minecraft.client.gui.Font font, int x, int y, int w, int h, String hint, String value, java.util.function.Consumer<String> onChange) {
		try {
			Class<?> c = Class.forName("net.minecraft.client.gui.components.MultiLineEditBox");
			Object b = c.getMethod("builder").invoke(null);
			Class<?> bc = b.getClass();
			bc.getMethod("setX", int.class).invoke(b, x);
			bc.getMethod("setY", int.class).invoke(b, y);
			bc.getMethod("setPlaceholder", net.minecraft.network.chat.Component.class).invoke(b, net.minecraft.network.chat.Component.literal(hint));
			Object box = bc.getMethod("build", net.minecraft.client.gui.Font.class, int.class, int.class, net.minecraft.network.chat.Component.class).invoke(b, font, w, h, net.minecraft.network.chat.Component.empty());
			c.getMethod("setValue", String.class).invoke(box, value);
			c.getMethod("setValueListener", java.util.function.Consumer.class).invoke(box, onChange);
			return (net.minecraft.client.gui.components.AbstractWidget) box;
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
			return null;
		}
	}

	/** Name of the world or server you just joined ("" if unknown). Singleplayer uses the save's name, multiplayer the server list name or address. */
	static String worldName(net.minecraft.client.Minecraft mc) {
		try {
			Object sp = mc.getClass().getMethod("getSingleplayerServer").invoke(mc);
			if (sp != null) {
				Object wd = sp.getClass().getMethod("getWorldData").invoke(sp);
				Object n = wd.getClass().getMethod("getLevelName").invoke(wd);
				return n == null ? "" : n.toString().trim();
			}
		} catch (Throwable ignored) { }
		try {
			Object sd = mc.getClass().getMethod("getCurrentServer").invoke(mc);
			if (sd != null) {
				for (String f : new String[]{"name", "ip"}) {
					Object v = sd.getClass().getField(f).get(sd);
					if (v != null && !v.toString().isBlank()) return v.toString().trim();
				}
			}
		} catch (Throwable ignored) { }
		return "";
	}
}
