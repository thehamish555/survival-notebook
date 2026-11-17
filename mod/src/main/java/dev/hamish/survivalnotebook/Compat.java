package dev.hamish.survivalnotebook;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.ConfirmLinkScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponentInitializers;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.data.registries.VanillaRegistries;
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

	/**
	 * The item with this id path (e.g. "diamond_sword"), or EMPTY if there's no such item. Cached once it works.
	 * Before a world's data is loaded the game can't make items at all ("Components not bound yet"), so a failure is never cached:
	 * caching it used to leave every icon blank for the whole session if the notebook was opened from the main menu first.
	 */
	static ItemStack stack(String path) {
		if (path == null || path.isBlank()) return ItemStack.EMPTY;
		Object level = Minecraft.getInstance().level;
		if (level != stacksFor) { STACKS.clear(); stacksFor = level; }   // a new world binds its own item data, so make the stacks again
		ItemStack hit = STACKS.get(path);
		if (hit != null) return hit;
		try {
			Identifier id = Identifier.withDefaultNamespace(path);
			if (!BuiltInRegistries.ITEM.containsKey(id)) { STACKS.put(path, ItemStack.EMPTY); return ItemStack.EMPTY; }   // not an item: that won't change
			ItemStack s;
			try { s = new ItemStack(BuiltInRegistries.ITEM.getValue(id)); }
			catch (RuntimeException e) { if (level != null || !bindForMenu()) return ItemStack.EMPTY; s = new ItemStack(BuiltInRegistries.ITEM.getValue(id)); }
			if (!s.isEmpty()) STACKS.put(path, s);
			return s;
		} catch (RuntimeException e) { return ItemStack.EMPTY; }
	}
	private static Object stacksFor;
	private static int menuBind;   // 0 not tried, 1 bound, -1 failed

	/**
	 * On the main menu no world has loaded, so items have no data yet and can't be drawn. This binds the vanilla defaults
	 * (built from the game's own registry code, the same data a new world starts with) so icons show there too.
	 * Joining a world binds that world's real data over the top, as it always does.
	 */
	static boolean bindForMenu() {
		if (menuBind != 0) return menuBind > 0;
		menuBind = -1;
		try {
			HolderLookup.Provider world = VanillaRegistries.createWorldLookup();
			HolderLookup.Provider lookup;
			try { lookup = VanillaRegistries.createReloadableLookup(world); } catch (RuntimeException e) { lookup = world; }
			BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(DataComponentInitializers.PendingComponents::apply);
			menuBind = 1;
		} catch (Throwable t) { com.mojang.logging.LogUtils.getLogger().warn("Couldn't prepare item icons for the main menu: {}", t.toString()); }
		return menuBind > 0;
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

	/** Text on the clipboard ("" if none or unavailable). */
	static String clipboard() {
		try {
			Minecraft mc = Minecraft.getInstance();
			Object kh = Minecraft.class.getField("keyboardHandler").get(mc);
			Object v = kh.getClass().getMethod("getClipboard").invoke(kh);
			return v == null ? "" : v.toString();
		} catch (ReflectiveOperationException | RuntimeException e) { return ""; }
	}

	/** Item id without "minecraft:" (modded items keep their namespace, e.g. "create:shaft"). */
	static String itemId(ItemStack s) {
		String id = BuiltInRegistries.ITEM.getKey(s.getItem()).toString();
		return id.startsWith("minecraft:") ? id.substring(10) : id;
	}

	// ---- map: one byte per block column, in the same packing vanilla maps use (colour id * 4 + shade). 0 = nothing seen.

	/** Top visible block of a column: y in the high bits, map colour id in the low byte. -1 if nothing has a map colour. */
	private static int column(net.minecraft.client.multiplayer.ClientLevel level, net.minecraft.world.level.chunk.LevelChunk ch, net.minecraft.core.BlockPos.MutableBlockPos pos, int wx, int wz, boolean ceiling, int fromY) {
		int minY = level.getMinY(), y;
		if (ceiling) {   // the Nether's roof would hide everything: start near the player and look for the first floor below open air
			y = Math.min(fromY, level.getMaxY() - 1);
			int n = 0;
			while (y > minY && n++ < 32 && !ch.getBlockState(pos.set(wx, y, wz)).isAir()) y--;
			n = 0;
			while (y > minY && n++ < 64 && ch.getBlockState(pos.set(wx, y, wz)).isAir()) y--;
		} else y = ch.getHeight(net.minecraft.world.level.levelgen.Heightmap.Types.WORLD_SURFACE, wx & 15, wz & 15);
		for (int n = 0; y >= minY && n < 48; n++, y--) {   // see through glass and other blocks that have no map colour
			net.minecraft.world.level.block.state.BlockState st = ch.getBlockState(pos.set(wx, y, wz));
			net.minecraft.world.level.material.MapColor c = st.getMapColor(level, pos);
			if (c != net.minecraft.world.level.material.MapColor.NONE) return (y << 8) | (c.id & 0xFF);
		}
		return -1;
	}

	/** How deep the water is under a water column (up to 10), for vanilla-style shading. */
	private static int waterDepth(net.minecraft.world.level.chunk.LevelChunk ch, net.minecraft.core.BlockPos.MutableBlockPos pos, int wx, int y, int wz) {
		int d = 0;
		while (d < 10 && !ch.getBlockState(pos.set(wx, y - d, wz)).getFluidState().isEmpty()) d++;
		return d;
	}

	/**
	 * The 16x16 map pixels of a loaded chunk (index z * 16 + x), shaded like a vanilla map: lighter when higher than the block to the north.
	 * Null if the chunk isn't loaded or this version can't read it.
	 */
	static byte[] mapChunk(int cx, int cz, int playerY) {
		try {
			var level = Minecraft.getInstance().level;
			if (level == null || !level.hasChunk(cx, cz)) return null;
			var ch = level.getChunk(cx, cz);
			var north = level.hasChunk(cx, cz - 1) ? level.getChunk(cx, cz - 1) : null;
			boolean ceiling = level.dimensionType().hasCeiling();
			var pos = new net.minecraft.core.BlockPos.MutableBlockPos();
			int[] top = new int[256], edge = new int[16];
			for (int x = 0; x < 16; x++) edge[x] = north == null ? -1 : column(level, north, pos, cx * 16 + x, cz * 16 - 1, ceiling, playerY);
			for (int z = 0; z < 16; z++) for (int x = 0; x < 16; x++) top[z * 16 + x] = column(level, ch, pos, cx * 16 + x, cz * 16 + z, ceiling, playerY);
			byte[] out = new byte[256];
			int water = net.minecraft.world.level.material.MapColor.WATER.id;
			for (int z = 0; z < 16; z++) for (int x = 0; x < 16; x++) {
				int t = top[z * 16 + x];
				if (t < 0) continue;
				int id = t & 0xFF, y = t >> 8, n = z > 0 ? top[(z - 1) * 16 + x] : edge[x];
				net.minecraft.world.level.material.MapColor.Brightness b;
				if (id == water) {
					double d = waterDepth(ch, pos, cx * 16 + x, y, cz * 16 + z) * 0.1 + ((x + z) & 1) * 0.2;
					b = d < 0.5 ? net.minecraft.world.level.material.MapColor.Brightness.HIGH : d > 0.9 ? net.minecraft.world.level.material.MapColor.Brightness.LOW : net.minecraft.world.level.material.MapColor.Brightness.NORMAL;
				} else if (n < 0 || (n >> 8) == y) b = net.minecraft.world.level.material.MapColor.Brightness.NORMAL;
				else b = y > (n >> 8) ? net.minecraft.world.level.material.MapColor.Brightness.HIGH : net.minecraft.world.level.material.MapColor.Brightness.LOW;
				out[z * 16 + x] = net.minecraft.world.level.material.MapColor.byId(id).getPackedId(b);
			}
			return out;
		} catch (RuntimeException | LinkageError e) { return null; }
	}

	// ---- drawing map tiles (the in-game Map tab): one 128x128 texture per tile

	private static final Map<String, net.minecraft.client.renderer.texture.DynamicTexture> TILE_TEX = new HashMap<>();

	/** Creates or refreshes the texture for a tile from its packed map bytes. Render thread only. Returns its id, or null if this version can't. */
	static Identifier tileTexture(String key, byte[] packed) {
		try {
			Identifier id = Identifier.fromNamespaceAndPath(SurvivalNotebookClient.ID, "map/" + key);
			var tex = TILE_TEX.get(key);
			if (tex == null) {
				tex = new net.minecraft.client.renderer.texture.DynamicTexture(() -> "survival_notebook map " + key, new com.mojang.blaze3d.platform.NativeImage(128, 128, true));
				Minecraft.getInstance().getTextureManager().register(id, tex);
				TILE_TEX.put(key, tex);
			}
			var img = tex.getPixels();
			for (int i = 0; i < 128 * 128; i++) {
				int p = packed[i] & 0xFF, argb = 0;
				if (p >= 4) { var c = net.minecraft.world.level.material.MapColor.byId(p >> 2); if (c != null) argb = c.calculateARGBColor(net.minecraft.world.level.material.MapColor.Brightness.byId(p & 3)) | 0xFF000000; }
				img.setPixel(i & 127, i >> 7, argb);
			}
			tex.upload();
			return id;
		} catch (RuntimeException | LinkageError e) { return null; }
	}

	/** Frees a tile texture that's no longer needed. */
	static void releaseTile(String key) {
		try { if (TILE_TEX.remove(key) != null) Minecraft.getInstance().getTextureManager().release(Identifier.fromNamespaceAndPath(SurvivalNotebookClient.ID, "map/" + key)); } catch (RuntimeException | LinkageError ignored) { }
	}

	/** Draws a whole texture stretched over the rectangle (x0, y0)-(x1, y1). */
	static void blitTile(GuiGraphicsExtractor g, Identifier id, int x0, int y0, int x1, int y1) {
		try { g.blit(id, x0, y0, x1, y1, 0f, 1f, 0f, 1f); } catch (RuntimeException | LinkageError ignored) { }
	}

	/** The open screen, if it's the ender chest: its 27 slots. Null otherwise. Works in any language (compares with the game's own title). */
	static List<ItemStack> enderChestSlots() {
		try {
			var screen = Minecraft.getInstance().gui.screen();
			if (!(screen instanceof net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<?> s)) return null;
			if (!s.getTitle().getString().equals(net.minecraft.network.chat.Component.translatable("container.enderchest").getString())) return null;
			var menu = s.getMenu();
			if (menu.slots.size() < 27 + 36) return null;
			List<ItemStack> out = new java.util.ArrayList<>();
			for (int i = 0; i < 27; i++) out.add(menu.getSlot(i).getItem());
			return out;
		} catch (RuntimeException | LinkageError e) { return null; }
	}

	/** Chunks the player can currently see, as a radius in chunks. */
	static int viewChunks() {
		try { return Minecraft.getInstance().options.getEffectiveRenderDistance(); } catch (RuntimeException | LinkageError e) { return 8; }
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
