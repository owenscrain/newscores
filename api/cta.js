// Vercel serverless function: next CTA Brown Line train from Addison to the Loop.
// The API key comes from the CTA_API_KEY environment variable in Vercel, so it
// never appears in the public page.

const STOP_ID = '30278'; // Addison (Brown Line), Loop-bound platform

module.exports = async (req, res) => {
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    // Let Vercel's edge cache share one CTA call across requests for 15s.
    res.setHeader('Cache-Control', status === 200 ? 's-maxage=15, stale-while-revalidate=15' : 'no-store');
    res.end(JSON.stringify(body));
  };

  const key = process.env.CTA_API_KEY;
  if (!key) return send(500, { error: 'CTA_API_KEY is not set' });

  const url = 'https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx'
    + `?key=${encodeURIComponent(key)}&stpid=${STOP_ID}&rt=Brn&max=5&outputType=JSON`;

  try {
    const r = await fetch(url);
    const { ctatt } = await r.json();
    if (ctatt.errCd !== '0') return send(502, { error: ctatt.errNm || 'CTA error' });

    // CTA times are Chicago local with no zone. Both come from the same clock,
    // so their difference is correct regardless of the server's time zone.
    const now = Date.parse(ctatt.tmst);
    const arrivals = (ctatt.eta || [])
      // Loop-bound only: this platform serves Loop-bound trains (trDr 5), but
      // check the direction and destination anyway.
      .filter(e => e.trDr === '5' && /loop/i.test(e.destNm))
      .map(e => ({
        minutes: Math.max(0, Math.round((Date.parse(e.arrT) - now) / 60000)),
        approaching: e.isApp === '1',
        delayed: e.isDly === '1',
        scheduled: e.isSch === '1',
      }))
      .sort((a, b) => a.minutes - b.minutes);

    send(200, { next: arrivals[0] || null, arrivals });
  } catch (err) {
    send(502, { error: 'Could not reach the CTA API' });
  }
};
