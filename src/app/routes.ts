import { createBrowserRouter, Outlet } from "react-router";
import AuthLayout from "./layouts/AuthLayout";
import DashboardLayout from "./layouts/DashboardLayout";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import HomePage from "./pages/HomePage";
import FaceDetectionPage from "./pages/face-detection/FaceDetectionPage";
import ResidentEnrollmentPage from "./pages/face-detection/ResidentEnrollmentPage";
import ResidentDirectoryPage from "./pages/face-detection/ResidentDirectoryPage";
import FaceImageCapturePage from "./pages/face-detection/FaceImageCapturePage";
import FaceLogsAnalyticsPage from "./pages/face-detection/FaceLogsAnalyticsPage";
import HelmetDetectionPage from "./pages/helmet-detection/HelmetDetectionPage";
import HelmetImageCapturePage from "./pages/helmet-detection/HelmetImageCapturePage";
import HelmetLogsAnalyticsPage from "./pages/helmet-detection/HelmetLogsAnalyticsPage";
import MaskDetectionPage from "./pages/mask-detection/MaskDetectionPage";
import MaskImageCapturePage from "./pages/mask-detection/MaskImageCapturePage";
import MaskLogsAnalyticsPage from "./pages/mask-detection/MaskLogsAnalyticsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AuthLayout,
    children: [
      { index: true, Component: LoginPage },
      { path: "login", Component: LoginPage },
      { path: "signup", Component: SignupPage },
    ],
  },
  {
    path: "/dashboard",
    Component: DashboardLayout,
    children: [
      { index: true, Component: HomePage },
      { path: "face-detection", Component: FaceDetectionPage },
      { path: "face-detection/enrollment", Component: ResidentEnrollmentPage },
      { path: "face-detection/directory", Component: ResidentDirectoryPage },
      { path: "face-detection/capture", Component: FaceImageCapturePage },
      { path: "face-detection/logs", Component: FaceLogsAnalyticsPage },
      { path: "helmet-detection", Component: HelmetDetectionPage },
      { path: "helmet-detection/capture", Component: HelmetImageCapturePage },
      { path: "helmet-detection/logs", Component: HelmetLogsAnalyticsPage },
      { path: "mask-detection", Component: MaskDetectionPage },
      { path: "mask-detection/capture", Component: MaskImageCapturePage },
      { path: "mask-detection/logs", Component: MaskLogsAnalyticsPage },
    ],
  },
]);
