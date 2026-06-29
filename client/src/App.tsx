import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CollegeProvider } from "./context/CollegeContext";
import Login from "./pages/Login";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminExamActivity from "./pages/admin/AdminExamActivity";
import AdminRecruiterAnalytics from "./pages/admin/AdminRecruiterAnalytics";
import AdminManage from "./pages/admin/AdminManage";
import CreateRecruiter from "./pages/admin/CreateRecruiter";
import CreateTpo from "./pages/admin/CreateTpo";
import TpoDashboard from "./pages/tpo/TpoDashboard";
import TpoStudents from "./pages/tpo/TpoStudents";
import TpoReports from "./pages/tpo/TpoReports";
import TpoActivity from "./pages/tpo/TpoActivity";
import RecruiterDashboard from "./pages/recruiter/RecruiterDashboard";
import RecruiterCandidateAnalytics from "./pages/recruiter/RecruiterCandidateAnalytics";
import RecruiterExamAnalytics from "./pages/recruiter/RecruiterExamAnalytics";
import CreateDrive from "./pages/recruiter/CreateDrive";
import CreateCandidate from "./pages/recruiter/CreateCandidate";
import CreateExam from "./pages/recruiter/CreateExam";
import ViewCandidates from "./pages/recruiter/ViewCandidates";
import ViewResults from "./pages/recruiter/ViewResults";
import RecruiterProctoring from "./pages/recruiter/RecruiterProctoring";
import RecruiterActiveMonitoring from "./pages/recruiter/RecruiterActiveMonitoring";
import VoiceInterviews from "./pages/recruiter/VoiceInterviews";
import AIInterviewScheduling from "./pages/recruiter/AIInterviewScheduling";
import CandidateDashboard from "./pages/candidate/CandidateDashboard";
import CandidateExamAnalytics from "./pages/candidate/CandidateExamAnalytics";
import CandidateMyExams from "./pages/candidate/CandidateMyExams";
import CandidateOnboarding from "./pages/candidate/CandidateOnboarding";
import CandidateInterview from "./pages/candidate/CandidateInterview";
import CandidateCertificates from "./pages/candidate/CandidateCertificates";
import TakeExam from "./pages/candidate/TakeExam";
import Layout from "./components/layout/Layout";
import RecruiterAIStudio from "./pages/recruiter/RecruiterAIStudio";
import RecruiterColleges from "./pages/recruiter/RecruiterColleges";


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
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
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
        <Route path="overview" element={<AdminDashboard />} />
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
        <Route path="overview" element={<TpoDashboard />} />
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
        <Route path="overview" element={<RecruiterDashboard />} />
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
        <Route path="overview" element={<CandidateDashboard />} />
        <Route path="exam-analysis" element={<CandidateExamAnalytics />} />
        <Route path="interview" element={<CandidateInterview />} />
        <Route path="certificates" element={<CandidateCertificates />} />
        <Route path="my-exams" element={<CandidateMyExams />} />
        <Route path="exam/:examId" element={<TakeExam />} />

      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <CollegeProvider>
        <AppRoutes />
      </CollegeProvider>
    </AuthProvider>
  );
}

export default App;
