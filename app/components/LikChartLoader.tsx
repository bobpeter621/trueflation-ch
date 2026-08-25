"use client";

/**
 * Client-Wrapper für dynamic(..., { ssr: false }) — Next.js 16 verbietet
 * ssr:false in Server Components (siehe app/page.tsx, das ein Server
 * Component bleibt). Chart.js/zoom-plugin greifen auf `window` zu und
 * dürfen daher nicht serverseitig gerendert werden.
 */

import dynamic from "next/dynamic";

const LikChart = dynamic(() => import("./LikChart"), { ssr: false });

export default LikChart;
