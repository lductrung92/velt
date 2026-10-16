import { Player } from "@remotion/player";
import { useCurrentFrame } from "remotion";
import {
  PAGE_HERO_DURATION,
  PageHeroArtwork,
  type PageHeroKind,
} from "./PageHeroArtwork";

function Scene({ kind }: { kind: PageHeroKind }) {
  return <PageHeroArtwork kind={kind} frame={useCurrentFrame()} />;
}

export default function PageHeroMotion({ kind }: { kind: PageHeroKind }) {
  return (
    <Player
      component={Scene}
      inputProps={{ kind }}
      durationInFrames={PAGE_HERO_DURATION}
      fps={30}
      compositionWidth={640}
      compositionHeight={440}
      autoPlay
      loop
      initiallyMuted
      numberOfSharedAudioTags={0}
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      errorFallback={() => <PageHeroArtwork kind={kind} />}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
