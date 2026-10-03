"use client";

import React, { useState } from "react";
import {
  X,
  Info,
  ShieldCheck,
  Award,
  Heart,
  Camera,
  CloudRain,
  Navigation,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useMascotContext } from "@/context/MascotContext";

interface AboutProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = "venha_intro_modal_seen_v1";

const TABS = [
  { id: "about", label: "Giới thiệu", icon: Info },
  { id: "terms", label: "Điều khoản & An toàn", icon: ShieldCheck },
  { id: "attribution", label: "Tôn Trọng & Bản Quyền", icon: Award },
  { id: "thanks", label: "Tri Ân & Chúc Phúc", icon: Heart },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function AboutProjectModal({
  isOpen,
  onClose,
}: AboutProjectModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("about");
  const [dontShowAgain, setDontShowAgain] = useState(true);

  const handleClose = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // ignore
      }
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md font-sans animate-fadeIn select-none"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5 shadow-md flex items-center justify-center overflow-hidden shrink-0">
              <img
                src="/logo-cat.png"
                alt="Logo"
                className="w-full h-full object-contain bg-white rounded-[10px]"
              />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight flex items-center gap-2">
                Về Nhà An Toàn
                <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                  Cộng Đồng TP.HCM
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bản đồ camera giao thông &amp; cảnh báo ngập lụt, mưa giông theo thời gian thực
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Đóng cửa sổ"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Bar - Centered Navigation (4 Tabs) */}
        <div className="flex items-center justify-center gap-1 sm:gap-2 px-4 pt-2.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto no-scrollbar">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap border-b-2 ${
                activeTab === id
                  ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-950/40"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40"
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-slate-700 dark:text-slate-300 space-y-4">
          {/* TAB 1: GIỚI THIỆU & LỢI ÍCH (GỘP CHUNG) */}
          {activeTab === "about" && (
            <div className="space-y-4 leading-relaxed">
              {/* Introduction Banner */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-100 dark:border-blue-900/50">
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  <strong className="text-blue-600 dark:text-blue-400">Về Nhà An Toàn (Venha)</strong> là dự án công nghệ phục vụ cộng đồng hoàn toàn phi lợi nhuận, ra đời với sứ mệnh đồng hành cùng hàng triệu bà con, học sinh, sinh viên và người lao động tại TP. Hồ Chí Minh trên mỗi cung đường trở về nhà bình an.
                </p>
              </div>

              {/* Quick Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-center">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
                  <span className="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400 block font-mono">
                    500+
                  </span>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Camera giao thông trực tiếp
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
                  <span className="text-lg sm:text-xl font-black text-cyan-600 dark:text-cyan-400 block font-mono">
                    24/7
                  </span>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Giám sát mưa & ngập úng
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
                  <span className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 block font-mono">
                    100%
                  </span>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Miễn phí vì cộng đồng
                  </span>
                </div>
              </div>

              {/* Benefits Cards Section */}
              <div className="pt-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  <span>Các tính năng &amp; lợi ích nổi bật</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Benefit 1 */}
                  <div className="p-3 rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-gradient-to-br from-blue-50/70 to-blue-100/30 dark:from-blue-950/30 dark:to-blue-900/10 space-y-1 shadow-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/20">
                        <Camera className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-blue-900 dark:text-blue-300">
                          Camera Trực Tiếp Toàn Thành Phố
                        </h5>
                        <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                          Hơn 500+ điểm nút giao thông
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      Xem ngay hình ảnh thực tế từ các trục đường chính, vòng xoay, cầu vượt và ngã tư tại tất cả các quận huyện và TP. Thủ Đức.
                    </p>
                  </div>

                  {/* Benefit 2 */}
                  <div className="p-3 rounded-xl border border-cyan-200/80 dark:border-cyan-900/50 bg-gradient-to-br from-cyan-50/70 to-cyan-100/30 dark:from-cyan-950/30 dark:to-cyan-900/10 space-y-1 shadow-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-cyan-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-cyan-500/20">
                        <CloudRain className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-cyan-900 dark:text-cyan-300">
                          Cảnh Báo Mưa &amp; Ngập Bằng AI
                        </h5>
                        <span className="text-[10px] font-medium text-cyan-600 dark:text-cyan-400">
                          Tự động phân tích mặt đường
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      Nhận diện chuẩn xác vệt nước đọng, đường trơn trượt và phân loại 4 mức độ ngập lụt từ an toàn đến ngập sâu hơn 40cm.
                    </p>
                  </div>

                  {/* Benefit 3 */}
                  <div className="p-3 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/70 to-emerald-100/30 dark:from-emerald-950/30 dark:to-emerald-900/10 space-y-1 shadow-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/20">
                        <Navigation className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                          Lập Lộ Trình Thay Thế An Toàn
                        </h5>
                        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          Chủ động tránh điểm ngập
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      Đề xuất tuyến đường tối ưu giúp phương tiện di chuyển suôn sẻ, hạn chế tối đa nguy cơ chết máy giữa đường ngập nước.
                    </p>
                  </div>

                  {/* Benefit 4 */}
                  <div className="p-3 rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-gradient-to-br from-amber-50/70 to-amber-100/30 dark:from-amber-950/30 dark:to-amber-900/10 space-y-1 shadow-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/20">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-amber-900 dark:text-amber-300">
                          Mascot Đồng Hành Dễ Thương
                        </h5>
                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          Bé Vịt &amp; Bé Mèo nhắc nhở
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      Lời nhắc nhở ấm áp về tình hình thời tiết, nhắc chuẩn bị áo mưa và giữ khoảng cách an toàn khi lái xe trong ngày mưa gió.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ĐIỀU KHOẢN & AN TOÀN */}
          {activeTab === "terms" && (
            <div className="space-y-3 text-xs leading-relaxed">
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 dark:bg-amber-950/40 dark:border-amber-900/60 p-3.5 flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold text-xs block mb-0.5">
                    Nguyên tắc an toàn giao thông tối thượng:
                  </strong>
                  <span>
                    Tuyệt đối không thao tác hoặc tra cứu điện thoại khi đang trực tiếp điều khiển phương tiện trên đường. Hãy luôn dừng xe tấp vào lề an toàn trước khi xem thông tin.
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-1">
                  <h5 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                    1. Tính chất thông tin &amp; Miễn trừ trách nhiệm
                  </h5>
                  <p className="text-slate-600 dark:text-slate-400">
                    Toàn bộ hình ảnh camera, đánh giá ngập lụt và lộ trình gợi ý được hệ thống tổng hợp tự động nhằm mục đích hỗ trợ tham khảo. Tình hình thời tiết và mực nước ngập thực tế có thể biến chuyển nhanh chóng; người tham gia giao thông luôn cần quan sát thực tế và tuyệt đối tuân thủ hiệu lệnh phân luồng của lực lượng Cảnh sát Giao thông tại hiện trường.
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-1">
                  <h5 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    2. Quyền riêng tư &amp; Không quảng cáo thương mại
                  </h5>
                  <p className="text-slate-600 dark:text-slate-400">
                    Ứng dụng cam kết hoàn toàn phi lợi nhuận, không thu thập danh tính cá nhân nhạy cảm, không chèn banner quảng cáo gây phiền toái và luôn phục vụ miễn phí cho cộng đồng.
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-1">
                  <h5 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                    3. Tinh thần xây dựng cộng đồng văn minh
                  </h5>
                  <p className="text-slate-600 dark:text-slate-400">
                    Dự án khuyến khích tinh thần tương thân tương ái, nhắc nhở nhau di chuyển cẩn thận, nhường nhịn khi tham gia giao thông và chia sẻ thông tin an toàn đến người thân và bạn bè.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TÔN TRỌNG & BẢN QUYỀN DỮ LIỆU */}
          {activeTab === "attribution" && (
            <div className="space-y-3.5 text-xs leading-relaxed">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                <p className="mb-2">
                  <strong className="text-slate-900 dark:text-white font-semibold">
                    Cam kết tôn trọng bản quyền &amp; Minh bạch nguồn dữ liệu:
                  </strong>
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  Dự án <em>Về Nhà An Toàn</em> trân trọng ghi nhận và tuân thủ các quy chuẩn sử dụng dữ liệu mở, tôn trọng quyền sở hữu trí tuệ của các cơ quan quản lý nhà nước và các tổ chức công nghệ sau:
                </p>
              </div>

              <div className="space-y-2">
                {[
                  {
                    code: "TTGT",
                    title: "Cổng Thông Tin Giao Thông TP.HCM",
                    agency: "Trung Tâm Quản Lý Điều Hành Giao Thông Đô Thị TP.HCM",
                    role: "Nguồn cấp dữ liệu luồng hình ảnh camera giám sát giao thông đô thị công khai.",
                    tag: "Camera",
                    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300",
                  },
                  {
                    code: "METEO",
                    title: "Open-Meteo Weather API",
                    agency: "Mô Hình Dự Báo Khí Tượng Toàn Cầu Mã Nguồn Mở",
                    role: "Cung cấp chỉ số WMO, lượng mưa (precipitation), vận tốc gió và triều cường thời gian thực.",
                    tag: "Khí tượng",
                    color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-300",
                  },
                  {
                    code: "LEAFLET",
                    title: "Leaflet & OpenStreetMap Contributors",
                    agency: "Cộng Đồng Bản Đồ Nguồn Mở Toàn Cầu",
                    role: "Hạ tầng hiển thị bản đồ địa lý tương tác, tối ưu trải nghiệm mượt mà trên di động.",
                    tag: "Bản đồ",
                    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300",
                  },
                  {
                    code: "AI",
                    title: "Google Gemini Multimodal Vision",
                    agency: "Google AI Platform",
                    role: "Mô hình trí tuệ nhân tạo hỗ trợ thị giác phân tích mặt đường ẩm ướt và đọng nước.",
                    tag: "Trí tuệ nhân tạo",
                    color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300",
                  },
                ].map((src) => (
                  <div
                    key={src.code}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 shadow-2xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="font-bold text-xs text-slate-900 dark:text-slate-100">
                        {src.title}
                      </h5>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${src.color}`}>
                        {src.tag}
                      </span>
                    </div>
                    <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                      {src.agency}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                      {src.role}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: TRI ÂN & LỜI CHÚC PHÚC */}
          {activeTab === "thanks" && (
            <div className="space-y-4">
              {/* DÒNG 1: Cảm ơn bà con & người dùng đặt trước */}
              <div className="p-3.5 rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/30 space-y-1">
                <h5 className="text-xs font-bold text-rose-900 dark:text-rose-300 flex items-center gap-1.5">
                  <Heart className="w-4 h-4 text-rose-600 fill-current" />
                  Tri ân Quý Bà Con &amp; Cộng Đồng Người Dùng
                </h5>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  Lời tri ân sâu sắc và chân thành nhất gửi đến toàn thể Bà Con, Cô Bác, các Anh Chị Em người dân, các bạn học sinh, sinh viên và người lao động đã luôn tin tưởng, sử dụng và chia sẻ ứng dụng Về Nhà An Toàn trong mỗi chuyến đi hằng ngày.
                </p>
              </div>

              {/* DÒNG 2: Cảm ơn các Cơ quan Quản lý & Đơn vị cung cấp dữ liệu */}
              <div className="p-3.5 rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/30 space-y-1">
                <h5 className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-blue-600" />
                  Cảm Ơn Các Cơ Quan Quản Lý &amp; Đơn Vị Dữ Liệu
                </h5>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  Trân trọng cảm ơn các Cơ quan Quản lý Đô thị, Trung tâm Điều hành Giao thông TP.HCM và các nền tảng dữ liệu khí tượng mở đã nỗ lực cung cấp và duy trì hạ tầng dữ liệu quý báu phục vụ sự an toàn của người dân.
                </p>
              </div>

              {/* PHẦN CHÚC NỔI BẬT ĐẸP ĐẼ VỚI CẢ 2 MASCOT */}
              <div className="relative overflow-hidden rounded-xl border-2 border-amber-300 dark:border-amber-500/50 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100/80 dark:from-amber-950/60 dark:via-orange-950/40 dark:to-amber-900/40 p-4 sm:p-5 shadow-lg">
                <div className="flex items-center gap-3 sm:gap-4">
                  {/* Mascot Avatars Group */}
                  <div className="flex -space-x-3 shrink-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 border-2 border-amber-400 p-1 shadow-md flex items-center justify-center rotate-[-4deg]">
                      <img
                        src="/mascot/duck/Vịt Nắng.png"
                        alt="Bé Vịt"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 border-2 border-amber-400 p-1 shadow-md flex items-center justify-center rotate-[4deg]">
                      <img
                        src="/mascot/cat/Mèo Nắng.png"
                        alt="Bé Mèo"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Heartfelt Wish Content */}
                  <div className="flex-1 min-w-0">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-200 text-[10px] font-black uppercase tracking-wider mb-1">
                      ✨ Lời chúc từ Bé Vịt &amp; Bé Mèo
                    </div>
                    <h4 className="text-xs sm:text-sm font-black text-amber-900 dark:text-amber-100 leading-snug">
                      Chúc Bạn Và Gia Đình Luôn Về Nhà Bình An!
                    </h4>
                    <p className="text-[11px] sm:text-xs text-amber-800/90 dark:text-amber-200/90 mt-1 leading-relaxed font-medium">
                      Mong rằng sau mỗi ngày dài học tập và làm việc vất vả, bạn luôn có những chặng đường trở về khô ráo, an toàn, giao thông thông suốt và ngập tràn nụ cười sum họp ấm áp bên người thân yêu! 🏡🛵💖
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span>Không hiển thị lại khi mở ứng dụng</span>
          </label>

          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition shadow-md shadow-blue-600/20 cursor-pointer"
          >
            Bắt đầu xem bản đồ
          </button>
        </div>
      </div>
    </div>
  );
}
