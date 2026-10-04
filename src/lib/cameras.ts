import cameraDataRaw from "@/data/data-camera.json";
import { CameraItem } from "@/types/camera";

export function getAllCameras(): CameraItem[] {
  return (cameraDataRaw as CameraItem[]).map((cam) => ({
    ...cam,
    District: cam.Disctrict || cam.District || "Khác",
  }));
}

export function getCameraById(id: string): CameraItem | undefined {
  const cameras = getAllCameras();
  return cameras.find((cam) => cam.CamId === id);
}

export function getDistricts(): string[] {
  const cameras = getAllCameras();
  const districtSet = new Set<string>();
  cameras.forEach((c) => {
    const d = c.District || c.Disctrict;
    if (d && d.trim() && d !== "N/A") {
      districtSet.add(d.trim());
    }
  });
  return Array.from(districtSet).sort((a, b) => a.localeCompare(b, "vi"));
}

/**
 * Generate official live camera player link directly on Cổng thông tin Giao thông TP.HCM
 */
export function getOfficialCameraPlayerUrl(camId: string, camLocation?: string): string {
  const location = encodeURIComponent(camLocation || "Camera Giao Thông TP.HCM");
  return `https://giaothong.hochiminhcity.gov.vn/expandcameraplayer/?camId=${encodeURIComponent(
    camId
  )}&camLocation=${location}&camMode=camera&videoUrl=https://d2zihajmogu5jn.cloudfront.net/bipbop-advanced/bipbop_16x9_variant.m3u8`;
}

