import type { AppProps } from "next/app";
import { AudioProvider } from "../components/AudioStore";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AudioProvider>
      <Component {...pageProps} />
    </AudioProvider>
  );
}
