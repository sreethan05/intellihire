import { Routes, Route, Navigate } from "react-router";
import { lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CollegeProvider } from "./context/CollegeContext";
import Layout from "./components/layout/Layout";

const Login = lazy(() => import("./pages/Login"));
const AdminExamActivity = lazy(() => import("./pages/admin/AdminExamActivity"));
const AdminRecruiterAnalytics = lazy(() => import("./pages/admin/AdminRecruiterAnalytics"));
const AdminManage = lazy(() => import("./pages/admin/AdminManage"));
const CreateRecruiter = lazy(() => import("./pages/admin/CreateRecruiter"));
const CreateTpo = lazy(() => import("./pages/admin/CreateTpo"));
const TpoStudents = lazy(() => import("./pages/tpo/TpoStudents"));
const TpoReports = lazy(() => import("./pages/tpo/TpoReports"));
const TpoActivity = lazy(() => import("./pages/tpo/TpoActivity"));
const RecruiterCandidateAnalytics = lazy(() => import("./pages/recruiter/RecruiterCandidateAnalytics"));
const RecruiterExamAnalytics = lazy(() => import("./pages/recruiter/RecruiterExamAnalytics"));
const CreateDrive = lazy(() => import("./pages/recruiter/CreateDrive"));
const CreateCandidate = lazy(() => import("./pages/recruiter/CreateCandidate"));
const CreateExam = lazy(() => import("./pages/recruiter/CreateExam"));
const ViewCandidates = lazy(() => import("./pages/recruiter/ViewCandidates"));
const ViewResults = lazy(() => import("./pages/recruiter/ViewResults"));
const RecruiterProctoring = lazy(() => import("./pages/recruiter/RecruiterProctoring"));
const RecruiterActiveMonitoring = lazy(() => import("./pages/recruiter/RecruiterActiveMonitoring"));
const VoiceInterviews = lazy(() => import("./pages/recruiter/VoiceInterviews"));
const AIInterviewScheduling = lazy(() => import("./pages/recruiter/AIInterviewScheduling"));
const CandidateSandbox = lazy(() => import("./pages/candidate/CandidateSandbox"));
const CandidateExamAnalytics = lazy(() => import("./pages/candidate/CandidateExamAnalytics"));
const CandidateMyExams = lazy(() => import("./pages/candidate/CandidateMyExams"));
const CandidateOnboarding = lazy(() => import("./pages/candidate/CandidateOnboarding"));
const CandidateInterview = lazy(() => import("./pages/candidate/CandidateInterview"));
const CandidateCertificates = lazy(() => import("./pages/candidate/CandidateCertificates"));
const TakeExam = lazy(() => import("./pages/candidate/TakeExam"));
const RecruiterAIStudio = lazy(() => import("./pages/recruiter/RecruiterAIStudio"));
const RecruiterColleges = lazy(() => import("./pages/recruiter/RecruiterColleges"));
const PublicPortfolio = lazy(() => import("./pages/PublicPortfolio"));
const PublicCertificateVerify = lazy(() => import("./pages/PublicCertificateVerify"));
const HubPage = lazy(() => import("./pages/HubPage"));


function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/" />;

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to={
              user.role === "admin" ? "/admin/overview" :
              user.role === "tpo" ? "/tpo/overview" :
              user.role === "recruiter" ? "/recruiter/overview" :
              user.must_change_password || user.profile_complete === false ? "/candidate/onboarding" : "/candidate/overview"
            } replace />
          ) : (
            <Login />
          )
        }
      />
      <Route
        path="/"
        element={
          user ? (
            <Navigate to={
              user.role === "admin" ? "/admin/overview" :
              user.role === "tpo" ? "/tpo/overview" :
              user.role === "recruiter" ? "/recruiter/overview" :
              user.must_change_password || user.profile_complete === false ? "/candidate/onboarding" : "/candidate/overview"
            } />
          ) : (
            <Navigate to="/login" />
          )
        }
      />

      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="dashboard" element={<Navigate to="/admin/overview" replace />} />
        <Route path="overview" element={<HubPage />} />
        <Route path="manage" element={<AdminManage />} />
        <Route path="recruiter-analytics" element={<AdminRecruiterAnalytics />} />
        <Route path="exam-activity" element={<AdminExamActivity />} />
        <Route path="create-recruiter" element={<CreateRecruiter />} />
        <Route path="create-tpo" element={<CreateTpo />} />
      </Route>

      <Route
        path="/tpo/*"
        element={
          <ProtectedRoute allowedRoles={["tpo"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="dashboard" element={<Navigate to="/tpo/overview" replace />} />
        <Route path="overview" element={<HubPage />} />
        <Route path="students" element={<TpoStudents />} />
        <Route path="reports" element={<TpoReports />} />
        <Route path="activity" element={<TpoActivity />} />
      </Route>

      <Route
        path="/recruiter/*"
        element={
          <ProtectedRoute allowedRoles={["recruiter"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="dashboard" element={<Navigate to="/recruiter/overview" replace />} />
        <Route path="overview" element={<HubPage />} />
        <Route path="exam-analytics" element={<RecruiterExamAnalytics />} />
        <Route path="candidate-analytics" element={<RecruiterCandidateAnalytics />} />
        <Route path="voice-interviews" element={<VoiceInterviews />} />
        <Route path="interview-scheduling" element={<AIInterviewScheduling />} />
        <Route path="proctoring" element={<RecruiterProctoring />} />
        <Route path="active-monitoring" element={<RecruiterActiveMonitoring />} />
        <Route path="create-drive" element={<CreateDrive />} />
        <Route path="create-candidate" element={<CreateCandidate />} />
        <Route path="create-exam" element={<CreateExam />} />
        <Route path="candidates" element={<ViewCandidates />} />
        <Route path="results/:examId?" element={<ViewResults />} />
        <Route path="ai-studio" element={<RecruiterAIStudio />} />
        <Route path="colleges" element={<RecruiterColleges />} />
      </Route>

      <Route
        path="/candidate/*"
        element={
          <ProtectedRoute allowedRoles={["candidate"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="dashboard" element={<Navigate to="/candidate/overview" replace />} />
        <Route path="onboarding" element={<CandidateOnboarding />} />
        <Route path="overview" element={<HubPage />} />
        <Route path="exam-analysis" element={<CandidateExamAnalytics />} />
        <Route path="interview" element={<CandidateInterview />} />
        <Route path="certificates" element={<CandidateCertificates />} />
        <Route path="my-exams" element={<CandidateMyExams />} />
        <Route path="exam/:examId" element={<TakeExam />} />
        <Route path="sandbox" element={<CandidateSandbox />} />
      </Route>

      <Route path="/portfolio/:slug" element={<PublicPortfolio />} />
      <Route path="/certificates/verify/:id" element={<PublicCertificateVerify />} />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

import { ErrorBoundary } from "./components/ErrorBoundary";

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CollegeProvider>
          <Suspense fallback={<div className="flex items-center justify-center h-screen bg-slate-50 text-slate-500 font-medium">Loading page...</div>}>
            <AppRoutes />
          </Suspense>
        </CollegeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
