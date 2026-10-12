import { Player } from "@remotion/player";
import { useCurrentFrame } from "remotion";

import { WorkspaceArtwork } from "./WorkspaceArtwork";

function WorkspaceScene() {
  return <WorkspaceArtwork frame={useCurrentFrame()} />;
}
function staticFallback() {
  return <WorkspaceArtwork />;
}

export default function DashboardMotion() {
  return (
    <Player
      component={WorkspaceScene}
      durationInFrames={360}
      fps={30}
      compositionWidth={310}
      compositionHeight={194}
      autoPlay
      initiallyMuted
      numberOfSharedAudioTags={0}
      loop
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      errorFallback={staticFallback}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
