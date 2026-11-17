package dev.hamish.survivalnotebook;

import com.terraformersmc.modmenu.api.ConfigScreenFactory;
import com.terraformersmc.modmenu.api.ModMenuApi;

/** Adds a "configure" button for this mod in Mod Menu: it opens the notebook on the Settings tab and returns to Mod Menu on Esc. */
public final class ModMenuIntegration implements ModMenuApi {
	@Override
	public ConfigScreenFactory<?> getModConfigScreenFactory() {
		return parent -> { NotebookScreen.tab = NotebookScreen.SETTINGS; return new NotebookScreen(parent); };
	}
}
