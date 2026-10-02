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
