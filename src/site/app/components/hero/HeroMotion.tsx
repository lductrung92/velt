import { Player } from "@remotion/player";
import { useCurrentFrame } from "remotion";
import { HERO_DURATION, HeroArtwork } from "./HeroArtwork";

function EcosystemScene() {
  return <HeroArtwork frame={useCurrentFrame()} />;
}
const fallback = () => <HeroArtwork />;

export default function HeroMotion() {
  return (
    <Player
      component={EcosystemScene}
      durationInFrames={HERO_DURATION}
      fps={30}
      compositionWidth={840}
      compositionHeight={700}
      autoPlay
      loop
      initiallyMuted
      numberOfSharedAudioTags={0}
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      errorFallback={fallback}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
