import Link from 'next/link'
import { Footer } from '@/lib/ui'

export const metadata = { title: 'Privacy' }
const EMAIL = 'hamishlester555@gmail.com'

export default function Privacy() {
  return <>
    <div className="hero" style={{ minHeight: 170 }}><div><Link href="/">← Home</Link><h1>Privacy</h1></div></div>
    <div className="wrap legal">
      <div className="card"><p className="mut">Last updated 17 November 2026</p>
        <p>The Survival Notebook is a hobby project run by Hamish Lester in New Zealand. This page explains what it keeps about you and why. If something here is unclear, email <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p></div>

      <div className="card"><h2>What we keep</h2>
        <p><b>Your account.</b> You sign in with Google. We get your email address and the name on your Google account, and keep them so you can sign in and so people can invite you. We never see your Google password.</p>
        <p><b>Your notebooks.</b> Everything you or your friends put in: places, to-dos, farms, notes, deaths, enchanted gear, stats, inventories, map tiles, uploaded Litematica files, nicknames, and a list of recent changes showing who changed what.</p>
        <p><b>From the mod.</b> If you connect the mod with a token, it sends the notebook data above as you. That includes your enchanted items, saved places, deaths, your vanilla statistics, and what you're carrying (including inside shulker boxes and bundles, plus your ender chest as it was when you last opened it) for the shopping list. You can turn stats and inventory off in the mod's Settings. With Share map on (the default), it also sends a map of the area around you as you explore. You can turn that off too. With "Notebook per world" on, it also uses the name of the world or server you join as a notebook name. Tokens are stored as a hash, so we can't read them back.</p>
        <p><b>Notifications.</b> If you turn notifications on for a device, we store the address your browser gives us for sending them. It goes to your browser's push service (for example Google's or Apple's) only when there's something to tell you. Turn them off on the Account page.</p>
        <p><b>On your device.</b> The site saves your sign-in, theme and sound settings, and a read-only copy of the notebooks you open (so they work offline), in your browser's local storage. There are no advertising or tracking cookies, and no analytics.</p></div>

      <div className="card"><h2>Who can see it</h2>
        <p>People in a notebook can see its contents and each other's display names and nicknames. Only the owner can see the email addresses of members. Nobody else can open your notebooks.</p>
        <p>We don't sell your data and we don't share it for advertising.</p></div>

      <div className="card"><h2>Services involved</h2>
        <p><b>Google</b> handles sign-in. The Google button loads from Google and is covered by Google's own privacy policy.</p>
        <p><b>Vercel</b> hosts the website, in the United States, and passes requests on to the server. It keeps its own logs.</p>
        <p><b>The server</b> that stores your data is run by Hamish. It logs the method, address and result of requests, never the contents or sign-in tokens.</p>
        <p><b>YouTube</b> loads when a farm shows a tutorial video. The mod also asks Mojang's servers for player skins, which is between your game and Mojang.</p></div>

      <div className="card"><h2>Keeping it safe</h2>
        <p>The website is served over HTTPS. For now, the connection between the website or the mod and the server is not encrypted, so avoid putting anything in a notebook that you wouldn't want an unlucky network to read. Backups of the database are kept for up to 14 days.</p></div>

      <div className="card"><h2>Your choices</h2>
        <p>You can change your display name, export a notebook as a file, revoke mod tokens, or delete your account on the Account page. Deleting your account removes it, the notebooks you own, your memberships, your gear, inventory, notification settings and your tokens. Copies in backups disappear within about two weeks.</p>
        <p>Under New Zealand's Privacy Act 2020 you can ask to see or correct the information held about you. Email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> and it will be sorted out.</p></div>

      <div className="card"><h2>Age</h2>
        <p>You need a Google account to sign in, so you need to meet Google's age requirements.</p>
        <h2 style={{ marginTop: 18 }}>Changes</h2>
        <p>If this page changes in a way that matters, the date at the top changes too.</p></div>
    </div>
    <Footer />
  </>
}