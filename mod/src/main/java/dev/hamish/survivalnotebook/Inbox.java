package dev.hamish.survivalnotebook;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.toasts.Toast;
import net.minecraft.client.gui.components.toasts.ToastManager;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

import java.util.ArrayList;
import java.util.List;

/**
 * Everything the mod tells you (saved places, sync results, errors, the weekly recap): a toast in the corner, and a list behind the
 * bell in the notebook's top right, with a red count of the ones you haven't seen. Nothing goes to chat.
 */
final class Inbox {
	private Inbox() { }

	record Note(long ts, String text, boolean error) { }
	private static final List<Note> NOTES = new ArrayList<>();
	private static final int KEEP = 50;
	static volatile int unread;
	static boolean open;

	static synchronized List<Note> notes() { return new ArrayList<>(NOTES); }

	/** Adds a message, newest first, and shows it as a toast (a repeat of the last message within two seconds only counts once). */
	static void add(String text, boolean error) {
		Minecraft mc = Minecraft.getInstance();
		mc.execute(() -> {
			synchronized (Inbox.class) {
				long now = System.currentTimeMillis();
				if (!NOTES.isEmpty() && NOTES.get(0).text().equals(text) && now - NOTES.get(0).ts() < 2000) return;
				NOTES.add(0, new Note(now, text, error));
				while (NOTES.size() > KEEP) NOTES.remove(NOTES.size() - 1);
				if (!open) unread++;
			}
			mc.gui.toastManager().addToast(new NoteToast(text, error));
			Notebook.bump();
		});
	}

	static void markRead() { unread = 0; Notebook.bump(); }
	static synchronized void clear() { NOTES.clear(); unread = 0; Notebook.bump(); }

	/** The red count on the bell: 1 to 9, then 9+. */
	static String count() { int n = unread; return n <= 0 ? "" : n > 9 ? "9+" : String.valueOf(n); }

	/** A toast in the notebook's colours: the logo, then the message over up to three lines. Errors get a red edge. Five seconds. */
	private static final class NoteToast implements Toast {
		private static final int W = 200;
		private final String text;
		private final boolean error;
		private List<FormattedCharSequence> lines;
		private long shown;

		NoteToast(String text, boolean error) { this.text = text; this.error = error; }

		private List<FormattedCharSequence> lines(Font font) {
			if (lines == null) { List<FormattedCharSequence> all = font.split(Component.literal(text), W - 34); lines = all.size() > 3 ? all.subList(0, 3) : all; }
			return lines;
		}

		@Override public int width() { return W; }
		@Override public int height() { return 20 + 10 * Math.max(1, lines(Minecraft.getInstance().font).size()); }
		@Override public Visibility getWantedVisibility() { return shown >= 5000 ? Visibility.HIDE : Visibility.SHOW; }
		@Override public void update(ToastManager manager, long time) { shown = time; }

		@Override
		public void extractRenderState(GuiGraphicsExtractor g, Font font, long time) {
			Ui.Pal p = Ui.pal();
			int h = height();
			Ui.rounded(g, 0, 0, W, h, p.panel, error ? 0xFFD9473A : p.gold);
			g.fill(1, 1, 4, h - 1, error ? 0xFFD9473A : p.gold);
			Compat.blitTile(g, net.minecraft.resources.Identifier.fromNamespaceAndPath(SurvivalNotebookClient.ID, "textures/gui/logo.png"), 9, 6, 25, 22);
			g.text(font, error ? "Survival Notebook · problem" : "Survival Notebook", 30, 6, error ? 0xFFFF9B8E : p.gold, false);
			int y = 17;
			for (FormattedCharSequence l : lines(font)) { g.text(font, l, 30, y, p.ink, false); y += 10; }
		}
	}
}
