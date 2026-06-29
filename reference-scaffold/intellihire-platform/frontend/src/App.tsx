import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import CandidateDashboard from "@/pages/candidate/CandidateDashboard";
import CandidateOnboarding from "@/pages/candidate/CandidateOnboarding";
import CertificatePage from "@/pages/candidate/CertificatePage";
import ExamResultPage from "@/pages/candidate/ExamResultPage";
import LoginPage from "@/pages/LoginPage";
import RecruiterDashboard from "@/pages/recruiter/RecruiterDashboard";
import RecruiterAnalytics from "@/pages/recruiter/RecruiterAnalytics";
import TpoDashboard from "@/pages/tpo/TpoDashboard";
import TPOAnalytics from "@/pages/tpo/TPOAnalytics";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import ExamContainer from "@/components/exam/ExamContainer";
import CodingSection from "@/components/coding/CodingSection";
import InterviewContainer from "@/components/interview/InterviewContainer";
import NotificationsPage from "@/pages/NotificationsPage";

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/${user.role}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/tpo" element={<ProtectedRoute roles={["tpo"]}><TpoDashboard /></ProtectedRoute>} />
      <Route path="/tpo/analytics" element={<ProtectedRoute roles={["tpo"]}><TPOAnalytics /></ProtectedRoute>} />
      <Route path="/recruiter" element={<ProtectedRoute roles={["recruiter"]}><RecruiterDashboard /></ProtectedRoute>} />
      <Route path="/recruiter/analytics/:driveId" element={<ProtectedRoute roles={["recruiter"]}><RecruiterAnalytics /></ProtectedRoute>} />
      <Route path="/candidate" element={<ProtectedRoute roles={["candidate"]}><CandidateDashboard /></ProtectedRoute>} />
      <Route path="/candidate/onboarding" element={<ProtectedRoute roles={["candidate"]}><CandidateOnboarding /></ProtectedRoute>} />
      <Route path="/candidate/results/:attemptId" element={<ProtectedRoute roles={["candidate"]}><ExamResultPage /></ProtectedRoute>} />
      <Route path="/candidate/certificate/:driveId" element={<ProtectedRoute roles={["candidate"]}><CertificatePage /></ProtectedRoute>} />
      <Route path="/exam/:examId" element={<ProtectedRoute roles={["candidate"]}><ExamContainer /></ProtectedRoute>} />
      <Route path="/coding/:questionId" element={<ProtectedRoute roles={["candidate"]}><CodingSection /></ProtectedRoute>} />
      <Route path="/interview/:templateId" element={<ProtectedRoute roles={["candidate"]}><InterviewContainer /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
