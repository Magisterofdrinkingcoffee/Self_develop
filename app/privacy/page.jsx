export const metadata = { title: "Privacy – Life Tracker" };

export default function Privacy() {
  return (
    <main className="main" style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1>Privacy</h1>
      <p className="muted" style={{ marginTop: 8 }}>Life Tracker is a private, single-user app owned by Bekassyl Azimkhan.</p>
      <div className="card" style={{ marginTop: 20, lineHeight: 1.7 }}>
        <p>Only the owner can sign in. When the owner connects Google, the app reads calendar events (read-only) and unread Gmail message headers and short previews (read-only) to show them on the owner's own dashboard.</p>
        <p style={{ marginTop: 12 }}>This data is fetched on demand and is not stored, sold, shared with anyone, or used for advertising. The access token is kept server-side in the owner's database and can be removed at any time with "Disconnect" in Settings or at myaccount.google.com/permissions.</p>
        <p style={{ marginTop: 12 }}>Use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.</p>
        <p style={{ marginTop: 12 }}>Contact: beka2007azimut@gmail.com</p>
      </div>
    </main>
  );
}
