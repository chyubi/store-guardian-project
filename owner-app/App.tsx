import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
} from "react-native";
import { createClient } from "@supabase/supabase-js";
import { useVideoPlayer, VideoView } from "expo-video";
// 💡 WebRTC를 위한 패키지 추가
import { RTCPeerConnection, RTCView, mediaDevices } from "react-native-webrtc";

// 수파베이스 설정
const SUPABASE_URL = "https://glmxqvkgdxbjxbsgppcr.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsbXhxdmtnZHhianhic2dwcGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDIwMDQsImV4cCI6MjA5MTY3ODAwNH0.t7heJwCoybiGE1G3ocYkpbCSqAjaRe400wm-n3ccJ8k";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORE_PIN = "1234"; // POS기와 통신할 핀번호

// 녹화된 비디오 재생용 컴포넌트
const ModernVideoPlayer = ({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) => {
  const player = useVideoPlayer(url, (player) => {
    player.muted = true;
    player.play();
  });

  return (
    <View style={styles.videoContainer}>
      <VideoView
        style={styles.video}
        player={player}
        allowsFullscreen
        allowsPictureInPicture
      />
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnText}>영상 닫기 ✖</Text>
      </TouchableOpacity>
    </View>
  );
};

export default function App() {
  const [logs, setLogs] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  // 💡 WebRTC 스트리밍 상태 관리 변수들
  const [isLive, setIsLive] = useState(false);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchLogs = async () => {
    setRefreshing(true);
    const { data, error } = await supabase
      .from("alert_logs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) console.error("데이터 불러오기 실패:", error);
    else setLogs(data || []);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchLogs();

    // 앱 종료 시 WebRTC 자원 정리
    return () => {
      stopLiveStream();
    };
  }, []);

  const getVideoUrl = (fileName: string) => {
    const { data } = supabase.storage
      .from("theft-videos")
      .getPublicUrl(fileName);
    return data.publicUrl;
  };

  // 💡 실시간 스트리밍 시작 로직
  const startLiveStream = async () => {
    setIsLive(true);
    setSelectedVideo(null); // 녹화된 영상 보던 건 끄기

    // 1. WebRTC 연결 객체 생성 (구글 스턴 서버 이용)
    const configuration = {
      iceServers: [{ url: "stun:stun.l.google.com:19302" }],
    };
    const pc = new RTCPeerConnection(configuration);
    pcRef.current = pc;

    // 2. POS기에서 영상이 넘어오면 화면에 띄우기 설정
    pc.ontrack = (event) => {
      console.log("🎥 POS 영상 수신 성공!");
      setRemoteStream(event.streams[0]);
    };

    // 3. 수파베이스를 통해 POS기에 통화(연결) 요청 보내기
    const channel = supabase.channel(`store-${STORE_PIN}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "pos-answer" }, (payload) => {
        console.log("🎥 POS 응답 수신완료");
        pc.setRemoteDescription(payload.payload.signal);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          console.log("📡 시그널링 채널 연결 완료, POS 호출 중...");
          const offer = await pc.createOffer({});
          await pc.setLocalDescription(offer);

          channel.send({
            type: "broadcast",
            event: "app-offer",
            payload: { signal: offer },
          });
        }
      });
  };

  // 💡 실시간 스트리밍 종료 로직
  const stopLiveStream = () => {
    setIsLive(false);
    setRemoteStream(null);
    if (pcRef.current) pcRef.current.close();
    if (channelRef.current) channelRef.current.unsubscribe();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 💡 헤더 및 실시간 매장보기 버튼 */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>🚨 실시간 도난 알림</Text>
        <TouchableOpacity
          style={[
            styles.liveBtn,
            { backgroundColor: isLive ? "#ef4444" : "#10b981" },
          ]}
          onPress={isLive ? stopLiveStream : startLiveStream}
        >
          <Text style={styles.liveBtnText}>
            {isLive ? "실시간 종료 ✖" : "🔴 실시간 매장보기"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 영상 출력 영역 (실시간 모드 vs 녹화영상 모드 vs 대기 모드) */}
      {isLive && remoteStream ? (
        <View style={styles.videoContainer}>
          <RTCView
            streamURL={remoteStream.toURL()}
            style={styles.video}
            objectFit="cover"
          />
        </View>
      ) : isLive && !remoteStream ? (
        <View style={styles.videoPlaceholder}>
          <Text style={{ color: "#fff" }}>POS기 연결 중...</Text>
        </View>
      ) : selectedVideo ? (
        <ModernVideoPlayer
          url={selectedVideo}
          onClose={() => setSelectedVideo(null)}
        />
      ) : (
        <View style={styles.videoPlaceholder}>
          <Text style={{ color: "#888" }}>
            아래 목록에서 알림을 선택해 영상을 확인하세요.
          </Text>
        </View>
      )}

      {/* 알림 리스트 영역 */}
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchLogs} />
        }
        renderItem={({ item }) => {
          const isTheft = item.event_type === "THEFT_SUSPECT";
          const date = new Date(item.created_at).toLocaleString();

          return (
            <TouchableOpacity
              style={styles.logCard}
              onPress={() => {
                if (isLive) stopLiveStream(); // 실시간 시청 중이면 끄고 재생
                setSelectedVideo(getVideoUrl(item.video_url));
              }}
            >
              <Text style={styles.logIcon}>{isTheft ? "🚨" : "ℹ️"}</Text>
              <View style={styles.logInfo}>
                <Text style={styles.logTitle}>
                  {isTheft ? "도난 의심 감지" : "일반 알림"}
                </Text>
                <Text style={styles.logDate}>{date}</Text>
              </View>
              <Text style={styles.playIcon}>▶️</Text>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f4f5" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingTop: 40,
    paddingRight: 15,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    padding: 20,
  },
  liveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  liveBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
  videoContainer: {
    width: "100%",
    height: 250,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  video: { width: "100%", height: "100%" },
  videoPlaceholder: {
    width: "100%",
    height: 250,
    backgroundColor: "#27272a",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  closeBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 10,
    borderRadius: 5,
  },
  closeBtnText: { color: "#fff", fontWeight: "bold" },
  logCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 15,
    marginVertical: 8,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  logIcon: { fontSize: 24, marginRight: 15 },
  logInfo: { flex: 1 },
  logTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ef4444",
    marginBottom: 4,
  },
  logDate: { fontSize: 12, color: "#666" },
  playIcon: { fontSize: 20, color: "#3b82f6" },
});
