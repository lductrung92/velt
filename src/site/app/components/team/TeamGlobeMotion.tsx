import { Player } from "@remotion/player";
import { useCurrentFrame } from "remotion";
import {
  GLOBE_DURATION,
  TeamGlobeArtwork,
  type GlobeProps,
} from "./TeamGlobeArtwork";

function Scene(props: GlobeProps) {
  return <TeamGlobeArtwork {...props} frame={useCurrentFrame()} />;
}
export default function TeamGlobeMotion(props: GlobeProps) {
  return (
    <Player
      component={Scene}
      inputProps={props}
      durationInFrames={GLOBE_DURATION}
      fps={30}
      compositionWidth={720}
      compositionHeight={600}
      autoPlay
      loop
      initiallyMuted
      numberOfSharedAudioTags={0}
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      errorFallback={() => <TeamGlobeArtwork {...props} />}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
