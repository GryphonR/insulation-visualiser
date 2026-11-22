// The site's legal pages: privacy (UK GDPR / PECR) and terms of use. Keep them true to what the code does:
// if the app starts sending data anywhere new, or adds analytics, update the privacy page in the same change.

// UK GDPR art. 13 and the E-Commerce Regulations need a real name, geographic address and email here.
export const OPERATOR = 'eChook';
export const ADDRESS = 'Ivy Cottage, Ivy Lane, Harbury, Warwickshire, CV33 9HN';
export const CONTACT = 'info@echook.uk';
export const UPDATED = '20 November 2026';

const ext = (href: string, text: string) => <a href={href} target="_blank" rel="noreferrer">{text}</a>;
const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

export function Privacy() {
  return (
    <article className="site-legal card">
      <h1>Privacy</h1>
      <p className="small muted">Last updated {UPDATED}</p>
      <p>Insuliser is run by {OPERATOR} ("we"), {ADDRESS}. We're the data controller for the personal data described here. Questions or requests: {mail}.</p>

      <h2>The short version</h2>
      <ul>
        <li>You can use Insuliser without an account. Your projects then stay in your browser and never reach us.</li>
        <li>If you sign in, we keep your email address and the projects and materials you sync, so you can open them on any device.</li>
        <li>We use synced projects to run and improve Insuliser, and to make anonymised statistics that don't identify anyone.</li>
        <li>No analytics, no advertising, no tracking cookies. We don't sell your personal data.</li>
      </ul>

      <h2>What we collect, and why</h2>
      <h3>Without an account</h3>
      <p>Projects, custom materials, favourites and settings are saved in your browser's local storage on your device. We can't see them. Clearing your browser's site data deletes them, so export anything you want to keep.</p>
      <h3>With an account</h3>
      <ul>
        <li><strong>Your email address</strong> (and name, if you sign in with Google), to identify you and send sign-in links.</li>
        <li><strong>What you sync</strong>: your projects, custom materials, library and favourites. Projects can include an address, postcode or location if you enter one.</li>
        <li><strong>Session details</strong>: a session record with your IP address and browser type, to keep you signed in and protect your account.</li>
      </ul>
      <p>We process this to provide the account you asked for (contract), and the session details for security (our legitimate interest in keeping accounts safe).</p>
      <p>We also analyse synced projects to improve Insuliser and develop new features, and to create anonymised, aggregated statistics, which no longer count as personal data (our legitimate interest in improving the service). You can object to this at any time. If we offer paid features, we'll keep the billing records the law requires.</p>
      <p>If we want to email you about new features or services, we'll only do so as the law allows, and every email will let you opt out. We'll never share your personal data with partners for their own marketing.</p>
      <h3>When you visit</h3>
      <p>Like any website, our host receives your IP address and browser details with each request, and keeps short-lived logs for running and securing the service (legitimate interests).</p>

      <h2>Who else handles it</h2>
      <p>We use these providers to run the service. Each processes data only to provide its part of it:</p>
      <ul>
        <li><strong>Cloudflare</strong>: hosting, and the database your synced data is stored in.</li>
        <li><strong>Resend</strong>: sends sign-in emails, so it receives your email address.</li>
        <li><strong>Google</strong>: only if you choose "Sign in with Google", which shares your name and email address with us.</li>
      </ul>
      <p>Your browser also contacts some services directly, which then see your IP address:</p>
      <ul>
        <li><strong>Google Fonts</strong>, for the typefaces, on every page.</li>
        <li><strong>OpenStreetMap's Overpass servers</strong>, only when you look up building outlines, with the map area you're looking at.</li>
        <li><strong>A satellite imagery provider</strong>, only if you add your own (for example Mapbox), under your own agreement with them.</li>
      </ul>
      <p>Some of these providers process data outside the UK. Where they do, it's covered by UK adequacy regulations or the UK's approved contract terms.</p>

      <h2>Cookies and local storage</h2>
      <p>If you sign in, we set one cookie to keep you signed in. It's strictly necessary for the account, so it doesn't need consent. Local storage holds your work and settings on your device, also only so the app works. We use no analytics, advertising or third-party cookies, so there's no cookie banner.</p>

      <h2>How long we keep it</h2>
      <p>Your account and synced data stay until you delete them. Billing records, if any, are kept for 6 years, as tax law requires. Use <strong>Delete account</strong> in the app's account menu and we remove your account and everything synced with it straight away. Sign-in links expire after 5 minutes, sessions after 7 days without use, and host logs within days.</p>

      <h2>Your rights</h2>
      <p>You can ask to see, correct, export or delete your data, or object to or restrict how we use it. Email {mail} and we'll reply within a month. You can also export your projects as files from the app at any time.</p>
      <p>If you're unhappy with how we've handled your data, you can complain to the {ext('https://ico.org.uk/make-a-complaint/', "Information Commissioner's Office")}. We'd appreciate the chance to put it right first.</p>

      <h2>Children</h2>
      <p>Insuliser isn't aimed at children, and accounts are for people aged 18 or over.</p>

      <h2>Changes</h2>
      <p>If we change this policy we'll update the date above, and tell account holders by email about anything significant.</p>
    </article>
  );
}

export function Terms({ base }: { base: string }) {
  return (
    <article className="site-legal card">
      <h1>Terms of use</h1>
      <p className="small muted">Last updated {UPDATED}</p>
      <p>These terms cover your use of Insuliser, an online tool for modelling heat loss, moisture and heating in buildings, including any paid features. By using it you agree to them. If you use Insuliser for a business, you agree to them on behalf of that business.</p>

      <h2>Who we are</h2>
      <p>Insuliser is run by {OPERATOR}, {ADDRESS}. Contact: {mail}.</p>

      <h2>The results are estimates</h2>
      <p>Insuliser's calculations are based on standard methods, published data and assumptions about your building. They're a guide, not a guarantee. Real buildings, materials and workmanship differ, results depend on what you enter, and real performance can be significantly better or worse than calculated.</p>
      <p>Insuliser isn't a substitute for a survey, a professional design or advice from a qualified person, and we don't provide professional services. You're responsible for checking results before you rely on them for design, purchasing, building work, compliance (such as Building Regulations, MCS or network operator requirements) or advice to others, and for the competence of anyone who does.</p>
      <p>Some data comes from third parties, such as climate data, standards and manufacturers' datasheets. It may be incomplete or out of date, and we may correct or change it without notice. Always check the current datasheet for a product.</p>

      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or over to create an account.</li>
        <li>Keep access to your email account secure: anyone who can read your email can sign in as you. You're responsible for what happens under your account.</li>
        <li>Projects without an account live in your browser. Keep exports of anything important; we can't recover data that's cleared from your device.</li>
        <li>Don't misuse the service: no attempts to break, overload, scrape or get unauthorised access to it, no reselling access to it, and no using it for anything unlawful.</li>
      </ul>

      <h2>Your content, and what we can do with it</h2>
      <p>You own the projects, designs and other content you create in Insuliser ("your content").</p>
      <p>For your content that reaches us (for example by syncing it to your account, or sending it to us), you give us a worldwide, non-exclusive, royalty-free licence to use, copy, store, back up, analyse and adapt it, and to share it with our service providers and partners, so that we can:</p>
      <ul>
        <li>provide, maintain and secure Insuliser;</li>
        <li>improve Insuliser and develop new features, products and services;</li>
        <li>tell you about features and services that may interest you.</li>
      </ul>
      <p>We may also create anonymised, aggregated data from your content and how you use Insuliser (for example typical build-ups, heat losses or emitter sizes), and use, share or publish it for any purpose. It won't identify you, your customers or a property.</p>
      <p>The licence ends when you delete your content or your account, except for anonymised data we've already created and copies in backups, which are overwritten in the normal course. Personal data in your content, such as a customer's name or address, is only ever handled as our <a href={`${base}privacy/`}>privacy policy</a> describes, never under this licence.</p>
      <p>Projects kept only in your browser never reach us, so none of this applies to them.</p>

      <h2>Other people's data</h2>
      <p>If you enter details about other people, such as customers, you're responsible for having a lawful reason to do so and for telling them how their data is used. Only enter what the design needs: don't put sensitive personal details in names or notes.</p>

      <h2>Paid features</h2>
      <p>Insuliser is free to use. We may offer paid features, plans or credits now or in future. When we do:</p>
      <ul>
        <li>We'll show the price, what's included and any renewal terms before you buy. Prices include VAT where it applies.</li>
        <li>Payments are taken by our payment provider. We don't see or store your full card details.</li>
        <li>Subscriptions renew automatically at the end of each period until you cancel. You can cancel at any time, and you keep access until the end of the period you've paid for. If a free trial turns into a paid plan, we'll tell you when you start it.</li>
        <li>If you're a consumer, you can cancel a new purchase within 14 days for a refund. If you asked us to start the service straight away, we may keep an amount for what you've used. Otherwise, payments aren't refundable for part periods or unused credits, except where the law says they are.</li>
        <li>We may change prices with at least 30 days' notice. Changes apply from your next renewal, and you can cancel before then.</li>
        <li>If a payment fails, we may pause paid features until it's sorted out.</li>
      </ul>
      <p>We may change which features are free or paid, but we won't take away a feature you've paid for during the period you've paid for.</p>

      <h2>Our software and brand</h2>
      <p>Insuliser's source code is published under the {ext('https://www.gnu.org/licenses/agpl-3.0.html', 'GNU Affero General Public License v3')}, and nothing in these terms limits your rights under that licence. The Insuliser name and logo, and this website's content, are ours: don't use them in a way that suggests a connection with us, and don't present a copy or modified version of Insuliser as ours.</p>
      <p>If you send us ideas or feedback, we can use them freely, without owing you anything.</p>

      <h2>The service</h2>
      <p>Insuliser is provided "as is". We'll try to keep it running and accurate, but we may change, pause or stop features, and we don't promise it'll always be available or error-free.</p>
      <p>We may suspend or close your account straight away for a serious or repeated breach of these terms, or otherwise on 30 days' notice. If we close a paid plan for any reason other than your breach, we'll refund the unused part. You can delete your account at any time from the app.</p>

      <h2>Liability</h2>
      <p>As far as the law allows, we're not liable for loss of profit, revenue, business, savings, goodwill or data, the cost of building work or remedial work, or any indirect or consequential loss. Our total liability to you for anything else arising from Insuliser is limited to the greater of £100 and what you paid us in the 12 months before the claim.</p>
      <p>Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or anything else that can't be limited by law. If you're a consumer, you also have legal rights that these terms don't affect.</p>
      <p>If you use Insuliser for business, you'll cover our reasonable losses from claims brought against us by your customers or others arising from your use of Insuliser or your breach of these terms.</p>

      <h2>Changes to these terms</h2>
      <p>We may update these terms. For significant changes we'll give account holders at least 30 days' notice by email or in the app, and they won't apply to anything that happened before they take effect. If you don't agree, you can stop using Insuliser and delete your account, and we'll refund the unused part of any paid plan.</p>

      <h2>Other</h2>
      <p>How we handle personal data is set out in our <a href={`${base}privacy/`}>privacy policy</a>. We may transfer these terms to another business that takes over Insuliser; your rights won't be reduced. If part of these terms can't be enforced, the rest still applies.</p>
      <p>These terms are governed by the law of England and Wales, and its courts have jurisdiction. If you're a consumer living in Scotland or Northern Ireland, you can also bring proceedings in your local courts.</p>
    </article>
  );
}
