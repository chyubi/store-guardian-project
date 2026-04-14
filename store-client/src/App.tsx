import React, { useRef, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js"; // 수파베이스 추가
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs-backend-webgl";
import "./App.css";

// 💡 1. 수파베이스 설정 (네 정보로 교체해!)
const SUPABASE_URL = "https://glmxqvkgdxbjxbsgppcr.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsbXhxdmtnZHhianhic2dwcGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDIwMDQsImV4cCI6MjA5MTY3ODAwNH0.t7heJwCoybiGE1G3ocYkpbCSqAjaRe400wm-n3ccJ8k";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SCAN_ZONE = { x: 400, y: 150, w: 200, h: 200 };
const BAG_ZONE = { x: 40, y: 250, w: 200, h: 200 };

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [alertMsg, setAlertMsg] = useState("🟢 매장 모니터링 중...");
  const [uploading, setUploading] = useState(false); // 업로드 상태 관리

  const lastActionRef = useRef("🟢 매장 모니터링 중...");
  const hasScannedRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isRecordingEventRef = useRef(false);

  const TARGET_FPS = 15;
  const FPS_INTERVAL = 1000 / TARGET_FPS;

  const setupCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });

    if (videoRef.current) {
      videoRef.current.srcObject = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm",
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          if (!isRecordingEventRef.current && chunksRef.current.length > 10) {
            chunksRef.current.shift();
          }
        }
      };
      mediaRecorder.start(1000);

      return new Promise((resolve) => {
        videoRef.current!.onloadedmetadata = () => {
          videoRef.current!.play();
          resolve(videoRef.current);
        };
      });
    }
  };

  // 💡 2. 수파베이스 업로드 함수
  const uploadToSupabase = async () => {
    if (chunksRef.current.length === 0) return;

    setUploading(true);
    const blob = new Blob(chunksRef.current, { type: "video/webm" });
    const fileName = `theft_${Date.now()}.webm`;

    try {
      // Storage에 파일 업로드
      const { data, error } = await supabase.storage
        .from("theft-videos")
        .upload(fileName, blob);

      if (error) throw error;

      console.log("✅ 업로드 성공:", data.path);
      setAlertMsg("🚀 증거 영상 전송 완료!");

      // DB에 로그 남기기 (나중에 사장님 앱에서 볼 수 있도록)
      const { error: dbError } = await supabase.from("alert_logs").insert([
        {
          event_type: "THEFT_SUSPECT",
          video_url: fileName,
        },
      ]);

      if (dbError) console.error("DB 기록 실패:", dbError);
    } catch (err) {
      console.error("업로드 에러:", err);
      setAlertMsg("❌ 서버 전송 실패");
    } finally {
      setUploading(false);
      chunksRef.current = [];
      isRecordingEventRef.current = false;
    }
  };

  const isInsideZone = (x: number, y: number, zone: any) => {
    return (
      x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h
    );
  };

  const runAI = async () => {
    await tf.ready();
    const detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING },
    );
    setIsLoaded(true);
    let lastTime = 0;

    const detectPose = async (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      if (deltaTime >= FPS_INTERVAL) {
        lastTime = currentTime - (deltaTime % FPS_INTERVAL);

        if (videoRef.current && videoRef.current.readyState >= 2) {
          const poses = await detector.estimatePoses(videoRef.current);

          if (poses.length > 0) {
            const kp = poses[0].keypoints;

            // 💡 수정 1: 양손을 각각 따로 찾아서 모두 검사할 준비를 합니다.
            const leftWrist = kp.find((p) => p.name === "left_wrist");
            const rightWrist = kp.find((p) => p.name === "right_wrist");

            // 기본 상태 텍스트
            let currentAction = hasScannedRef.current
              ? "🛒 스캔 완료 (포장 대기 중...)"
              : "🟢 매장 모니터링 중...";

            // 💡 수정 2: 이미 도난을 감지해서 녹화 중이라면, 상태 텍스트를 다른 걸로 덮어쓰지 않고 경고를 유지합니다!
            if (isRecordingEventRef.current) {
              currentAction =
                "🚨 도난 의심 감지! (증거 녹화 및 서버 전송 중...)";
            } else {
              // 녹화 중이 아닐 때만 양손의 위치를 검사합니다.
              const checkWrist = (
                wrist: poseDetection.Keypoint | undefined,
              ) => {
                if (wrist && wrist.score && wrist.score > 0.3) {
                  // 파란색 스캐너 박스에 들어갔을 때
                  if (isInsideZone(wrist.x, wrist.y, SCAN_ZONE)) {
                    hasScannedRef.current = true;
                    currentAction = "🛒 상품 스캔 감지됨!";
                  }
                  // 주황색 가방 박스에 들어갔을 때
                  else if (isInsideZone(wrist.x, wrist.y, BAG_ZONE)) {
                    if (hasScannedRef.current) {
                      currentAction = "✅ 정상 포장 확인됨";
                      hasScannedRef.current = false; // 정상 포장이니 스캔 상태 초기화
                    } else {
                      // 스캔 안 하고 가방으로 갔으니 도난 처리!
                      isRecordingEventRef.current = true;
                      currentAction =
                        "🚨 도난 의심 감지! (증거 녹화 및 서버 전송 중...)";
                      setTimeout(uploadToSupabase, 3000); // 3초 뒤에 수파베이스로 업로드
                    }
                  }
                }
              };

              // 왼손과 오른손을 모두 검사합니다.
              checkWrist(leftWrist);
              checkWrist(rightWrist);
            }

            // 화면의 글씨가 바뀌었을 때만 업데이트 (리렌더링 최적화)
            if (lastActionRef.current !== currentAction) {
              lastActionRef.current = currentAction;
              setAlertMsg(currentAction);
            }
          }
          drawCanvas(poses, videoRef.current);
        }
      }
      requestAnimationFrame(detectPose);
    };
    requestAnimationFrame(detectPose);
  };

  const drawCanvas = (poses: poseDetection.Pose[], video: HTMLVideoElement) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(0, 150, 255, 0.3)";
    ctx.fillRect(SCAN_ZONE.x, SCAN_ZONE.y, SCAN_ZONE.w, SCAN_ZONE.h);
    ctx.fillStyle = "rgba(255, 100, 0, 0.3)";
    ctx.fillRect(BAG_ZONE.x, BAG_ZONE.y, BAG_ZONE.w, BAG_ZONE.h);

    if (poses.length > 0) {
      poses[0].keypoints.forEach((p) => {
        if (p.score && p.score > 0.3) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = "red";
          ctx.fill();
        }
      });
    }
  };

  useEffect(() => {
    const initApp = async () => {
      await setupCamera();
      await runAI();
    };
    initApp();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginTop: "20px",
        fontFamily: "sans-serif",
      }}
    >
      <h1>무인매장 POS기 AI 카메라</h1>
      <div
        style={{
          padding: "15px 30px",
          borderRadius: "10px",
          marginBottom: "15px",
          fontWeight: "bold",
          fontSize: "1.2rem",
          color: "white",
          backgroundColor: uploading
            ? "#f59e0b"
            : lastActionRef.current.includes("🚨")
              ? "#ef4444"
              : lastActionRef.current.includes("✅")
                ? "#22c55e"
                : lastActionRef.current.includes("🛒")
                  ? "#3b82f6"
                  : "#374151",
        }}
      >
        {uploading ? "☁️ 서버로 영상 전송 중..." : alertMsg}
      </div>
      <div
        style={{
          position: "relative",
          width: "640px",
          height: "480px",
          backgroundColor: "#000",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "640px",
            height: "480px",
            objectFit: "cover",
            transform: "scaleX(-1)",
          }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "640px",
            height: "480px",
            zIndex: 10,
            transform: "scaleX(-1)",
          }}
        />
      </div>
    </div>
  );
}

export default App;
