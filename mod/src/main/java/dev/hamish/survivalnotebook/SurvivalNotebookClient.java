package dev.hamish.survivalnotebook;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.resources.Identifier;
import org.lwjgl.sdl.SDLScancode;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

public class SurvivalNotebookClient implements ClientModInitializer {
	static final String ID = "survival_notebook";
	private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");

	private KeyMapping openKey, saveKey, quickKey, hudKey;
	private int ticks;
	private String lastGear = "";
	private boolean deathSeen;
	private int deathAt = -1;
	private boolean wasInWorld;
	private int joinTick = -1;
	private int leaveTicks;
	private Names.Spot deathSpot;
	private Deaths.Loot deathLoot;

	@Override
	public void onInitializeClient() {
		KeyMapping.Category category = KeyMapping.Category.register(Identifier.fromNamespaceAndPath(ID, "main"));
		openKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.survival_notebook.open", InputConstants.Type.KEYBOARD, SDLScancode.SDL_SCANCODE_N, category));
		saveKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.survival_notebook.save_place", InputConstants.Type.KEYBOARD, SDLScancode.SDL_SCANCODE_B, category));
		quickKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.survival_notebook.quick_save", InputConstants.Type.KEYBOARD, SDLScancode.SDL_SCANCODE_UNKNOWN, category));
		hudKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.survival_notebook.toggle_hud", InputConstants.Type.KEYBOARD, SDLScancode.SDL_SCANCODE_H, category));

		HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, Identifier.fromNamespaceAndPath(ID, "waypoints"), Waypoints::extract);
		HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, Identifier.fromNamespaceAndPath(ID, "todo_hud"), TodoHud::extract);
		HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, Identifier.fromNamespaceAndPath(ID, "compass_hud"), CompassHud::extract);
		ClientTickEvents.END_CLIENT_TICK.register(this::onTick);
		ClientReceiveMessageEvents.GAME.register((message, overlay) -> { if (!overlay) Deaths.onGameMessage(message.getString(), ticks); });   // "Steve was slain by Zombie"

		Commands.register();  // /notebook, /notebook place <name>, /notebook todo <text>
		Live.start();         // live updates from the website
		Notebook.connect();   // loads your notebooks + the selected one in the background
	}

	private void onTick(Minecraft mc) {
		while (openKey.consumeClick()) mc.gui.setScreen(new NotebookScreen());
		while (saveKey.consumeClick()) addPlace(mc);
		while (quickKey.consumeClick()) quickSave();
		while (hudKey.consumeClick()) { NbConfig c = NbConfig.get(); c.hud = !c.hud; NbConfig.save(); }
		if (Commands.openSoon && mc.gui.screen() == null) { Commands.openSoon = false; mc.gui.setScreen(new NotebookScreen()); }
		if (mc.player == null) {
			if (wasInWorld && leaveTicks == 0) Players.leave();   // off the team's map straight away
			if (wasInWorld && ++leaveTicks == 80) shareStats();   // just left a world: its stats file has been saved by now
			if (leaveTicks > 80 || !wasInWorld) { wasInWorld = false; leaveTicks = 0; }
			return;
		}
		if (!wasInWorld) { joinTick = 0; MapRecorder.reset(); }
		wasInWorld = true; leaveTicks = 0;
		if (joinTick >= 0 && ++joinTick == 40) { joinTick = -1; Notebook.joinWorld(Compat.worldName(mc)); }   // ~2s in, once the server data is there

		NbConfig cfg = NbConfig.get();
		ticks++;
		if (cfg.shareStats && Notebook.canEdit()) {   // your own vanilla statistics -> the website's Stats tab
			if (ticks == 200) PlayerStats.requestFromServer(mc);
			if (ticks == 300 || (ticks > 300 && ticks % 6000 == 300)) shareStats();
			if (ticks > 300 && ticks % 6000 == 200) PlayerStats.requestFromServer(mc);
		}
		if (ticks % 60 == 0) Notebook.minimapTick();   // ~every 3s: mirrors the minimap's waypoints if you turned syncing on
		if (ticks % 1200 == 0) Notebook.refresh();   // keep to-dos and places fresh (~every minute)
		if (ticks % 600 == 0 && cfg.autoSyncGear && Notebook.canEdit()) {   // ~every 30s, only writes when your gear actually changed
			JsonArray gear = GearScanner.scan();
			String json = gear.toString();
			if (!json.equals(lastGear)) { lastGear = json; Notebook.syncGear(gear, false); }
		}
		if (ticks % 10 == 5 && cfg.shareInventory) InventoryScanner.watchEnder();
		if (ticks % 600 == 450 && cfg.shareInventory && Notebook.canEdit()) Notebook.syncInventory(InventoryScanner.scan());   // ~every 30s, only when it changed
		if (cfg.shareMap && Notebook.canEdit()) MapRecorder.tick(mc, ticks);
		Players.tick(mc, ticks);

		boolean dead = mc.gui.screen() instanceof DeathScreen;
		if (!dead && mc.player.isAlive() && ticks % 10 == 0) Deaths.snapshot();   // what you're carrying, so a death knows what was lost

		if (dead && !deathSeen) {   // first moment of the death screen: your position is still where you died
			deathSeen = true;
			deathSpot = Names.here();
			deathLoot = Deaths.last();
			deathAt = ticks;
		}
		if (!dead) deathSeen = false;
		if (deathAt >= 0 && ticks - deathAt >= 15) {   // wait a moment so the "how you died" chat line has arrived
			if (cfg.autoSaveDeaths && Notebook.canEdit() && deathSpot != null) Notebook.recordDeath(Deaths.row(deathSpot, Deaths.cause(ticks), deathLoot));
			deathAt = -1; deathSpot = null;
		}

		if (cfg.autoRecover && ticks % 20 == 0) checkRecovered(cfg);
	}

	private void shareStats() {
		PlayerStats.Raw raw = PlayerStats.read();
		if (raw != null) Notebook.syncStats(PlayerStats.row(raw, System.currentTimeMillis()));
	}

	/** Walking up to a tracked death spot marks it as recovered and stops tracking it. */
	private void checkRecovered(NbConfig cfg) {
		if (cfg.trackedPlace.isBlank() || !Notebook.canEdit()) return;
		JsonObject d = Notebook.find("deaths", cfg.trackedPlace);
		if (d == null || Notebook.bool(d, "recovered")) return;
		Names.Rel r = Names.relTo(d);
		Names.Spot here = Names.here();
		if (r == null || r.approx() || here == null) return;
		Double dist = Names.distance(r.xyz());
		if (dist == null || dist > 4) return;
		final String id = cfg.trackedPlace;
		cfg.trackedPlace = ""; NbConfig.save();
		Notebook.patchRow("deaths", id, o -> o.addProperty("recovered", true));
		Notebook.msg("Back at your death spot. Marked as recovered.");
	}

	/** B: opens a new place in the notebook, prefilled with where you're standing, so you can name it and set its details. */
	private void addPlace(Minecraft mc) {
		if (Names.here() == null) { Notebook.msg("Can't read your position in this dimension"); return; }
		PagePlaces.addHere();
		mc.gui.setScreen(new NotebookScreen());
	}

	/** Optional unbound key: saves a place instantly with an automatic name. */
	private void quickSave() {
		Names.Spot spot = Names.here();
		if (spot == null) { Notebook.msg("Can't read your position in this dimension"); return; }
		if (!Notebook.canEdit()) { Notebook.msg("Not connected (press N, then Settings)"); return; }
		Notebook.savePlace("Place " + HHMM.format(LocalTime.now()), "Important", spot);
	}
}
