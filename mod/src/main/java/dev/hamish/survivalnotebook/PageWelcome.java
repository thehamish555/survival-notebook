package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;

/**
 * First run: links the game to a website account without copying a token. "Link this game" gets a short code from the server and opens
 * the website, where the player approves it while signed in; meanwhile this page checks every couple of seconds and connects by itself.
 */
final class PageWelcome {
	private PageWelcome() { }

	static volatile String code = "", status = "";
	private static volatile String secret = "";
	private static volatile long expires;
	private static volatile int attempt;   // bumps on every new code or cancel, so an old wait stops

	static void build(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		NbConfig c = NbConfig.get();
		int y = s.top + 4;
		s.text("Welcome to the Survival Notebook", s.cx, y, p.gold);
		y += 16;
		y += s.wrap("Keep your places, gear, farms and to-dos in one notebook, shared with your friends and on the website.", s.cx, y, s.cw - 10, p.ink) + 10;

		if (code.isEmpty()) {
			s.text("1. Link this game to your account", s.cx, y, p.ink);
			y += 12;
			y += s.wrap("You'll sign in on the website (it makes your account if you don't have one) and approve this game. No copying needed.", s.cx + 10, y, s.cw - 20, p.mut) + 8;
			s.btn(s.cx + 10, y, 160, "Link this game", 0, () -> start(s), true);
			y += 30;
			if (!status.isEmpty()) { s.text(status, s.cx + 10, y, 0xFFFF9B8E); y += 14; }
			y += 6;
			s.text("Already have a token?", s.cx, y, p.mut);
			s.pill(s.cx + s.font().width("Already have a token?") + 8, y - 4, 110, 16, "Paste it in Settings", p.secondary, () -> {
				NotebookScreen.tab = NotebookScreen.SETTINGS; PageSettings.cat = "Connection"; NotebookScreen.resetEditors(); s.rebuild();
			}, true);
			return;
		}

		s.text("2. Approve this code on the website", s.cx, y, p.ink);
		y += 16;
		final int cy = y;
		s.paint((g, mx, my) -> {   // the code, big, so it's easy to compare with the website
			Ui.bevel(g, s.cx + 10, cy, 170, 34, p.panel2, p.hi, p.lo, p.edge);
			g.pose().pushMatrix(); g.pose().translate(s.cx + 18, cy + 8); g.pose().scale(2f, 2f);
			g.text(s.font(), code, 0, 0, p.gold, false);
			g.pose().popMatrix();
		});
		y += 42;
		y += s.wrap("The website opened in your browser. Sign in, check the code matches, and press Link this game. This page connects by itself.", s.cx + 10, y, s.cw - 20, p.mut) + 8;
		final int wy = y;
		s.paint((g, mx, my) -> {   // counts down while you wait
			long left = Math.max(1, (expires - System.currentTimeMillis() + 59_999) / 60_000);
			g.text(s.font(), "Waiting for you to approve it… (the code lasts " + left + " more min)", s.cx + 10, wy, p.amber.fg(), false);
		});
		y += 18;
		s.btn(s.cx + 10, y, 150, "Open the website again", 1, () -> Compat.openUrl(s, c.web() + "/link?code=" + code), true);
		s.btn(s.cx + 166, y, 70, "Cancel", 1, () -> { attempt++; code = ""; status = ""; s.rebuild(); }, true);
	}

	/** Asks the server for a code, opens the website with it, and waits for the approval. */
	private static void start(NotebookScreen s) {
		final int mine = ++attempt;
		status = "";
		String who;
		try { who = Minecraft.getInstance().getUser().getName(); } catch (RuntimeException e) { who = ""; }
		JsonObject body = new JsonObject();
		body.addProperty("name", who.isBlank() ? "Minecraft" : "Minecraft (" + who + ")");
		Api.EXEC.execute(() -> {
			try {
				Api.Res r = Api.anon("POST", "/link/start", body);
				if (r.status() / 100 != 2 || !r.body().isJsonObject()) { fail(mine, "Couldn't get a code. " + Api.errorOf(r)); return; }
				JsonObject o = r.body().getAsJsonObject();
				if (mine != attempt) return;
				code = Notebook.str(o, "code"); secret = Notebook.str(o, "secret");
				expires = System.currentTimeMillis() + o.get("expiresIn").getAsLong() * 1000;
				Notebook.bump();
				Compat.openUrl(s, NbConfig.get().web() + "/link?code=" + code);
				waitForApproval(mine);
			} catch (Api.ApiException e) { fail(mine, e.getMessage()); }
		});
	}

	private static void waitForApproval(int mine) {
		Thread t = new Thread(() -> {
			while (mine == attempt && System.currentTimeMillis() < expires) {
				try { Thread.sleep(2000); } catch (InterruptedException e) { return; }
				if (mine != attempt) return;
				try {
					JsonObject body = new JsonObject(); body.addProperty("secret", secret);
					Api.Res r = Api.anon("POST", "/link/poll", body);
					if (r.status() == 202) continue;
					if (r.status() == 200 && r.body().isJsonObject() && r.body().getAsJsonObject().has("token")) { connected(mine, r.body().getAsJsonObject().get("token").getAsString()); return; }
					if (r.status() == 410) break;
				} catch (Api.ApiException ignored) { /* the network blipped: keep waiting */ }
			}
			fail(mine, "That code ran out. Press Link this game for a new one.");
		}, "Survival Notebook link");
		t.setDaemon(true);
		t.start();
	}

	private static void connected(int mine, String token) {
		if (mine != attempt) return;
		NbConfig c = NbConfig.get();
		c.token = token; NbConfig.save();
		code = ""; secret = ""; status = "";
		Notebook.msg("Linked! Your notebook syncs from now on.");
		Notebook.connect();
		Minecraft mc = Minecraft.getInstance();
		mc.execute(() -> { if (mc.level != null) Notebook.joinWorld(Compat.worldName(mc)); });   // in a world already: open (or make) its notebook
		Notebook.bump();
	}

	private static void fail(int mine, String why) {
		if (mine != attempt) return;
		code = ""; secret = ""; status = why; Notebook.bump();
	}
}
