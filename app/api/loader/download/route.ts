import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  const format = searchParams.get('format');

  if (!url || !format) {
    console.error('[Download Proxy] Missing parameters:', { url, format });
    return NextResponse.json({ error: 'Missing url or format' }, { status: 400 });
  }

  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes('youtube.com') && !urlObj.hostname.includes('youtu.be')) {
       return NextResponse.json({ error: 'Only YouTube URLs are supported by this bypass.' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Malformed URL provided.' }, { status: 400 });
  }

  try {
    console.log(`[Download Proxy] Initiating request for URL: ${url}, Format: ${format}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const res = await fetch(
      `https://loader.to/ajax/download.php?start=1&end=1&format=${format}&url=${encodeURIComponent(url)}`,
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      const text = await res.text();
      console.error(`[Download Proxy] Upstream API HTTP Error: ${res.status} ${res.statusText}`, text);
      
      let errorMsg = 'Upstream bypass is currently unreachable.';
      if (res.status === 429) errorMsg = 'Rate limit exceeded. Slow down.';
      if (res.status >= 500) errorMsg = 'Upstream server is over capacity.';

      return NextResponse.json({ error: errorMsg, details: `HTTP ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    
    if (!data.id && data.success === false) {
      console.error('[Download Proxy] Upstream API returned logical error:', data);
      return NextResponse.json({ 
        error: data.text || 'Upstream rejected the download request.', 
        success: false 
      }, { status: 400 });
    }
    
    return NextResponse.json(data);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out. Connection to proxy was too slow.' }, { status: 504 });
    }
    console.error('[Download Proxy] Internal Exception:', err.message);
    return NextResponse.json({ error: 'Failed to proxy request', details: err.message }, { status: 500 });
  }
}
