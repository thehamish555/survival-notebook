package com.terraformersmc.modmenu.api;

/**
 * Compile-time copy of Mod Menu's entrypoint interface, so this mod can offer a settings button without depending on Mod Menu.
 * It is excluded from the jar (see build.gradle); at runtime Mod Menu's real interface is used. Keep the signature identical.
 */
public interface ModMenuApi {
	default ConfigScreenFactory<?> getModConfigScreenFactory() { return parent -> null; }
}
