import { NextResponse } from 'next/server';
import youtubedl from 'youtube-dl-exec';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 });
  }

  try {
    const output = await youtubedl(url, {
      dumpSingleJson: true,
      flatPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
    } as any);
    return NextResponse.json(output);
  } catch (err: any) {
    // Suppress noisy server crash logs for yt blocks
    return NextResponse.json(
      { error: 'Failed to fetch playlist metadata.', details: err?.message || 'Detection bypass failed temporarily.' },
      { status: 400 }
    );
  }
}
