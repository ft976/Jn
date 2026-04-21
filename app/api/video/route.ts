import { NextResponse } from 'next/server';
import youtubedl from 'youtube-dl-exec';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 });
  }

  try {
    const output = (await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
    } as any)) as any;

    const heights = new Set<number>();
    let hasCaptions = false;
    let highestFps = 30;

    if (output.formats) {
      output.formats.forEach((f: any) => {
        if (f.height) heights.add(f.height);
        if (f.fps && f.fps > highestFps) highestFps = f.fps;
      });
    }

    if (output.subtitles && Object.keys(output.subtitles).length > 0) {
      hasCaptions = true;
    }

    // Identify which exact resolutions the video natively supports
    const validHeights = [360, 480, 720, 1080, 1440, 2160];
    const availableFormats: string[] = [];
    
    validHeights.forEach(h => {
      if (heights.has(h)) {
        if (h === 2160) availableFormats.push('4k');
        else availableFormats.push(h.toString());
      }
    });

    if (availableFormats.length === 0) {
       availableFormats.push('360', '720', '1080'); 
    }

    return NextResponse.json({
      title: output.title,
      thumbnail: output.thumbnail,
      duration: output.duration,
      author_name: output.uploader,
      hasCaptions,
      fps: highestFps,
      views: output.view_count,
      availableFormats
    });
  } catch (err: any) {
    const message = err?.message || '';
    let userError = 'Limited extraction mode.';
    let status = 400;

    if (message.includes('403') || message.includes('Sign in to confirm you’re not a bot')) {
      userError = 'Bot detection triggered. Try again in a few minutes.';
    } else if (message.includes('This video is private')) {
      userError = 'This video is private and cannot be extracted.';
    } else if (message.includes('Inappropriate for some users')) {
      userError = 'Age-restricted video. Bypass temporarily unavailable.';
    } else if (message.includes('Geoblocking') || message.includes('not available in your country')) {
      userError = 'Region-restricted content. Access blocked.';
    } else if (message.includes('URL is invalid') || message.includes('not a valid URL')) {
      userError = 'Invalid YouTube URL provided.';
    }

    return NextResponse.json(
      { error: userError, details: message },
      { status: status }
    );
  }
}
