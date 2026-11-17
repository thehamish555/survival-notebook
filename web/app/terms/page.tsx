import Link from 'next/link'
import { Footer } from '@/lib/ui'

export const metadata = { title: 'Terms' }
const EMAIL = 'hamishlester555@gmail.com'

export default function Terms() {
  return <>
    <div className="hero" style={{ minHeight: 170 }}><div><Link href="/">← Home</Link><h1>Terms</h1></div></div>
    <div className="wrap legal">
      <div className="card"><p className="mut">Last updated 17 November 2026</p>
        <p>The Survival Notebook is a free hobby project by Hamish Lester. By signing in or using the website or the mod, you agree to these terms.</p></div>

      <div className="card"><h2>Using it</h2>
        <p>Sign in with your own Google account and keep your mod tokens private. You're responsible for what happens under your account.</p>
        <p>Don't use it to break the law, harass people, upload anything harmful, or try to break into or overload the service. Uploads are for Litematica files only.</p>
        <p>Notebook owners decide who joins and can remove members. If you invite people, you're responsible for the notebook's contents.</p></div>

      <div className="card"><h2>Your content</h2>
        <p>What you put in a notebook stays yours. You let the service store and show it to the people you share it with, which is all it's used for. You can export it or delete it at any time.</p></div>

      <div className="card"><h2>The mod</h2>
        <p>The mod is a client-side Fabric mod that sends your notebook data to the service when you connect it. It's provided as it is. It isn't an official Minecraft product and is not approved by or associated with Mojang Studios or Microsoft.</p></div>

      <div className="card"><h2>No guarantees</h2>
        <p>This is run by one person in their spare time. It's provided as it is, with no promise that it will always be available, error-free, or keep your data forever. Keep your own copy of anything important (there's an export on each notebook). To the extent the law allows, Hamish isn't liable for lost data or other losses from using it.</p>
        <p>The service may change, pause or stop, and accounts that break these terms may be removed.</p></div>

      <div className="card"><h2>Other things</h2>
        <p>These terms are governed by New Zealand law. If they change in a way that matters, the date above changes. How your information is handled is covered in the <Link href="/privacy">Privacy page</Link>.</p>
        <p>Questions: <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p></div>
    </div>
    <Footer />
  </>
}