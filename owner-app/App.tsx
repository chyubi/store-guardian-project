import React, { useEffect, useState } from "react";
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
import { useVideoPlayer, VideoView } from "expo-video"; // 💡 최신 패키지로 변경됨!

// 수파베이스 설정
const SUPABASE_URL = "https://glmxqvkgdxbjxbsgppcr.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsbXhxdmtnZHhianhic2dwcGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDIwMDQsImV4cCI6MjA5MTY3ODAwNH0.t7heJwCoybiGE1G3ocYkpbCSqAjaRe400wm-n3ccJ8k";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 💡 비디오 플레이어 컴포넌트 분리 (최신 expo-video 방식)
const ModernVideoPlayer = ({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) => {
  const player = useVideoPlayer(url, (player) => {
    player.muted = true; // 웹 브라우저 자동 재생 차단 방지를 위해 음소거 설정
    player.play(); // 자동 재생
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
  }, []);

  const getVideoUrl = (fileName: string) => {
    const { data } = supabase.storage
      .from("theft-videos")
      .getPublicUrl(fileName);
    return data.publicUrl;
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.headerTitle}>🚨 실시간 도난 알림</Text>

      {/* 비디오 플레이어 영역 */}
      {selectedVideo ? (
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
              onPress={() => setSelectedVideo(getVideoUrl(item.video_url))}
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
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    padding: 20,
    paddingTop: 40,
    backgroundColor: "#fff",
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
    backgroundColor: "#e4e4e7",
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
