import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    console.error('[Progress Proxy] Missing task id');
    return NextResponse.json({ error: 'Missing task id' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://loader.to/ajax/progress.php?id=${id}`);
    
    if (!res.ok) {
      const text = await res.text();
      console.error(`[Progress Proxy] Upstream API HTTP Error for Task ${id}: ${res.status} ${res.statusText}`, text);
      return NextResponse.json({ error: 'Upstream API error', details: `HTTP ${res.status}: ${res.statusText}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[Progress Proxy] Internal Exception for Task', id, ':', err.message, err.stack);
    return NextResponse.json({ error: 'Failed to proxy request', details: err.message }, { status: 500 });
  }
}
