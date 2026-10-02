import React, { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCameraById, getAllCameras, getDistricts } from "@/lib/cameras";
import { CameraProvider } from "@/context/CameraContext";
import Link from "next/link";
import { ArrowLeft, MapPin, Video, Info } from "lucide-react";
import CameraCard from "@/components/CameraCard";

interface CameraPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateStaticParams() {
  const cameras = getAllCameras();
  return cameras.slice(0, 20).map((cam) => ({
    id: cam.CamId,
  }));
}

export default async function CameraDetailPage({ params }: CameraPageProps) {
  const { id } = await params;
  const camera = getCameraById(id);

  if (!camera) {
    notFound();
  }

  const allCameras = getAllCameras();
  const districts = getDistricts();

  const relatedCameras = allCameras
    .filter(
      (c) =>
        c.CamId !== camera.CamId &&
        (c.District || c.Disctrict) === (camera.District || camera.Disctrict)
    )
    .slice(0, 3);

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <CameraProvider initialCameras={allCameras} districts={districts}>
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
          <div className="max-w-5xl mx-auto">
            {/* Navigation Breadcrumb */}
            <div className="mb-6 flex items-center justify-between">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại danh sách</span>
              </Link>

              <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-mono">
                ID: {camera.CamId}
              </span>
            </div>

            {/* Main Camera Live Feed */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl mb-8">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                    {camera.CamName}
                  </h1>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{camera.District || "TP.HCM"}</span>
                  </div>
                </div>
              </div>

              {/* Big Live Stream */}
              <div className="relative aspect-video bg-black flex items-center justify-center">
                <img
                  src={`/api/proxy?id=${encodeURIComponent(camera.CamId)}&t=${Date.now()}`}
                  alt={camera.CamName}
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-400" />
                  <span>Dữ liệu luồng trực tiếp từ Trung tâm Quản lý Giao thông đô thị TP.HCM</span>
                </div>
                <Link href="/" className="text-blue-400 hover:underline">
                  Xem trên bản lưới
                </Link>
              </div>
            </div>

            {/* Related Cameras in District */}
            {relatedCameras.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Video className="w-5 h-5 text-blue-400" />
                  <h2 className="text-base font-bold text-white">
                    Camera khác tại khu vực {camera.District || "lân cận"}
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {relatedCameras.map((relCam) => (
                    <CameraCard key={relCam.CamId} camera={relCam} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CameraProvider>
    </Suspense>
  );
}
