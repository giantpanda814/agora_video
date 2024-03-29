import React, { useEffect, useRef, useState } from "react";
import AgoraRTC from "agora-rtc-sdk";

import config from "./config";
import LocalStream from "./localStream";
import RemoteStream from "./RemoteStream";
import CallControls from "./CallControls";
import { v4 as uuidv4 } from "uuid";

import "./style.css";
import { notification } from "antd";

const { AGORA_APP_ID } = config;

const AgoraVideo = ({
  channel = "hello_agora_video" /* receive channel as a prop */,
  userID = uuidv4() /* user ID as a prop */,
  token = "006d874b444c4d84e3fab1db6af0ef8a40aIAB0UHMHln2HdxiAWwmud1YHy6MKGTV4IyuTKdHMclLYBoLfv3wAAAAAEABedM71riEiXwEAAQCtISJf" /* token as a prop */,
  leaveCall: leavePage,
}) => {
  const client = useRef(null);
  const localStream = useRef();
  const remoteStream = useRef();
  const localInterval = useRef();
  const remoteInterval = useRef();
  const [expanded, setExpanded] = useState(false);
  const [localRatio, setLocalRatio] = useState(1);
  const [remoteRatio, setRemoteRatio] = useState(1);

  const received = useRef();
  received.current = true;

  const deviceIndex = useRef();
  deviceIndex.current = 0;

  const getDevices = () => {
    return new Promise((resolve) => {
      AgoraRTC.getDevices((dvcs) =>
        resolve(dvcs.filter(({ kind }) => kind === "videoinput"))
      );
    });
  };

  const switchDevice = (id) =>
    new Promise((resolve, reject) => {
      localStream.current.getVideoTrack().stop();
      localStream.current.switchDevice("video", id, resolve, reject);
    });

  const switchCamera = async () => {
    const devices = await getDevices();
    if (devices.length < 2) {
      return;
    }

    deviceIndex.current = (deviceIndex.current + 1) % 2;
    localStream.current.getVideoTrack().stop();

    while (1) {
      try {
        await switchDevice(devices[deviceIndex.current].deviceId);
        break;
      } catch (e) {}
    }
  };

  // call when remote stream is removed
  const remoteStreamRemoved = () => {
    clearInterval(remoteInterval.current);
  };

  // leave the current call
  const leaveCall = () => {
    clearInterval(localInterval.current);
    clearInterval(remoteInterval.current);
    client.current.leave();
    localStream.current.close();
    leavePage();
  };

  const joinChannel = () => {
    client.current.join(token, channel, userID, (uid) => {
      localStream.current = AgoraRTC.createStream({
        streamID: uid,
        audio: true,
        video: true,
        screen: false,
      });

      // Init local stream
      localStream.current.init(
        () => {
          console.log("stream init success");
          localStream.current.play("agora_local");

          // Get aspect ratio
          localInterval.current = setInterval(() => {
            try {
              let {
                aspectRatio,
                height,
                width,
              } = localStream.current.getVideoTrack().getSettings();

              if (!aspectRatio && height && width) {
                aspectRatio = width / height;
              }

              if (aspectRatio !== localRatio) {
                setLocalRatio(aspectRatio);
              }

              // If width is larger than 720, then set the video profile to 720p_1
              if (width > 720) {
                localStream.current.setVideoProfile("720p_1");
              }
            } catch (e) {
              clearInterval(localInterval.current);
            }
          }, 1000);

          client.current.publish(localStream.current, (err) =>
            console.error("publish failed", err)
          );
        },
        (err) => {
          console.error("stream init fail", err);
          if (err.info === "Permission denied") {
            notification.error({
              message: "Permission not granted",
              description: (
                <div>
                  You need to give this app permission to use your device’s
                  camera and microphone.
                  <a href="#">Click here</a>
                </div>
              ),
            });
          }
        }
      );
    });
  };

  // subscribe to stream events to hear the remote stream
  const subscribeStreamEvents = () => {
    // Remote stream added
    client.current.on("stream-added", function (evt) {
      let stream = evt.stream;

      client.current.subscribe(stream, (err) =>
        console.log("subscribe remote failed", err)
      );
    });

    // Peer leaved the call
    client.current.on("peer-leave", function () {
      remoteStream.current.stop();
      clearInterval(remoteInterval.current);
      document.querySelector(".loader").innerHTML =
        "The other participant left the call.";
    });

    // Remote stream subscribed
    client.current.on("stream-subscribed", function (evt) {
      if (!received.current) {
        received.current = true;

        clearInterval(localInterval.current);
        clearInterval(remoteInterval.current);
        client.current.leave();
        localStream.current.stop();
        localStream.current.close();

        joinChannel();
        return;
      }

      remoteStream.current = evt.stream;
      remoteStream.current.play(
        "agora_remote",
        {
          fit: !expanded ? "contain" : "cover",
        },
        async () => {}
      );

      remoteInterval.current = setInterval(() => {
        try {
          const {
            aspectRatio,
          } = remoteStream.current.getVideoTrack().getSettings();
          if (aspectRatio !== remoteRatio) {
            setRemoteRatio(aspectRatio);
          }
        } catch (e) {
          clearInterval(remoteInterval.current);
        }
      }, 1000);
    });

    // Remote stream removed
    client.current.on("stream-removed", function (evt) {
      remoteStreamRemoved();
    });
  };

  useEffect(() => {
    // Create the client, init and subscribe the stream events

    client.current = AgoraRTC.createClient({ mode: "rtc", codec: "h264" });
    client.current.init(AGORA_APP_ID, () => {}, []);
    received.current = false;
    subscribeStreamEvents();
    // Join to the channel
    joinChannel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ background: "#303070", width: "100%", height: "100%" }}>
      <LocalStream
        expanded={expanded}
        setExpanded={setExpanded}
        aspectRatio={localRatio}
      />
      <RemoteStream
        expanded={!expanded}
        setExpanded={setExpanded}
        aspectRatio={remoteRatio}
      />
      <CallControls
        stream={localStream.current}
        leaveCall={leaveCall}
        switchCamera={switchCamera}
      />
    </div>
  );
};

export default AgoraVideo;
