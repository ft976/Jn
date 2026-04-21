# BypassTube - Pro YouTube Downloader

BypassTube is a sophisticated, high-speed YouTube video and playlist downloader designed to circumvent modern bot detection and extraction limits. Built with Next.js 15, it provides a seamless, "mission control" style interface for high-precision media extraction.

## 🚀 Key Features

- **Deep Analysis Engine**: Real-time extraction of native video resolutions (up to 4K), HDR support, and multi-language captions/subtitles.
- **Smart Bot Bypass**: Intelligent error handling and category-based retry logic to mitigate YouTube's automated blocking.
- **Playlist & Batch Extraction**: Efficiently parse and queue entire playlists for parallel processing.
- **Mission Control UI**: A technical, information-dense interface featuring:
  - Real-time progress tracking for every task.
  - Unlimited usage without daily tokens.
  - Detailed extraction history with local persistence.
- **Audio Specialist Mode**: High-bitrate extraction for MP3, M4A, FLAC, and WAV formats.

## 🛠 Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS 4.0
- **Animations**: Framer Motion (motion/react)
- **Icons**: Lucide React
- **Backend Utilities**: `youtube-dl-exec` for metadata extraction
- **In-Browser persistence**: LocalStorage for history tracking

## 📐 Architecture

### Extraction Layer
The application uses a hybrid extraction strategy:
1. **Metadata Phase**: Server-side extraction using `youtube-dl-exec` to fetch accurate quality maps and metadata without exposing API keys.
2. **Proxy Bypass Phase**: Client-side requests are proxied via custom Next.js API routes to managed extraction endpoints (`loader.to` integration) with built-in timeout and retry logic.

### State Management
- **Active Tasks**: Managed via React `useState` and `useRef` for high-frequency progress polling (1s intervals).
- **History Persistence**: Handled via lazy state initialization to ensure `localStorage` sync is efficient and Next.js build-friendly.

## 🛡 Security & Error Handling

BypassTube implements a "Zero-Trust" error handling model:
- **Specific Error Categorization**: Distinguishes between Bot Detection, Geoblocking, Private Content, and Age Restrictions.
- **Bypass Resilience**: Optimized for maximum reliability with automatic retry hints.
- **Timeout Protection**: Standardized 15-second timeout on all upstream requests to prevent bridge-locking.

## 📦 Deployment

The application is configured for production-grade deployment:
- **Stand-alone Build**: Optimized for Cloud Run/Docker environments.
- **Image Optimization**: Custom RemotePatterns for YouTube image hosting.
- **Telemetry**: Fully anonymous telemetry for roadmap prioritization.

---

*Note: For educational and personal use only. Please respect the copyright of content creators.*
