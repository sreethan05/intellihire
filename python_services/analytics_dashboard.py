import streamlit as st
import pandas as pd
import psycopg2
import os

class IntelliHireStreamlitApp:
    """
    A Python-based Streamlit dashboard that connects directly to the PostgreSQL database
    to visualize college placement stats, exam attempts, and candidate analytics.
    """
    def __init__(self):
        self.db_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/intellihire")

    def get_connection(self):
        """Establish a connection to the PostgreSQL database."""
        return psycopg2.connect(self.db_url)

    def fetch_data(self, query):
        """Fetch query results into a Pandas DataFrame."""
        conn = self.get_connection()
        try:
            df = pd.read_sql_query(query, conn)
            return df
        finally:
            conn.close()

    def run(self):
        st.set_page_config(page_title="IntelliHire Analytics Portal", layout="wide")
        st.title("📊 IntelliHire Python Data Analytics Dashboard")
        st.markdown("Real-time PostgreSQL database insights on student performance, exam statistics, and system proctoring logs.")

        # Sidebar connection checks
        st.sidebar.header("Database Configuration")
        st.sidebar.success("Connected to PostgreSQL successfully!")
        
        # 1. Fetch KPI metrics
        try:
            users_df = self.fetch_data("SELECT count(*) as count FROM users")
            exams_df = self.fetch_data("SELECT count(*) as count FROM exams")
            attempts_df = self.fetch_data("SELECT count(*) as count FROM attempts")
            questions_df = self.fetch_data("SELECT count(*) as count FROM questions")
            
            col1, col2, col3, col4 = st.columns(4)
            col1.metric("Registered Users", users_df["count"].values[0])
            col2.metric("Total Exams", exams_df["count"].values[0])
            col3.metric("Exam Attempts", attempts_df["count"].values[0])
            col4.metric("Question Bank Size", questions_df["count"].values[0])
        except Exception as e:
            st.error(f"Failed to load dashboard metrics: {str(e)}")

        st.markdown("---")

        # 2. Candidate CGPA Distribution Graph
        st.subheader("🎓 Student CGPA Distribution by Major/Branch")
        try:
            cgpa_query = """
                SELECT branch, cgpa, graduation_year 
                FROM candidate_profiles 
                WHERE cgpa IS NOT NULL AND cgpa > 0
            """
            cgpa_df = self.fetch_data(cgpa_query)
            if not cgpa_df.empty:
                chart_data = cgpa_df.pivot_table(index="branch", values="cgpa", aggfunc="mean").reset_index()
                st.bar_chart(data=chart_data, x="branch", y="cgpa")
                st.dataframe(cgpa_df)
            else:
                st.warning("No candidate profile records containing CGPA were found in the database.")
        except Exception as e:
            st.error(f"Error rendering CGPA graph: {str(e)}")

        st.markdown("---")

        # 3. Proctoring violations log audit
        st.subheader("🚨 Real-Time Proctoring Audit Log Analysis")
        try:
            proctor_query = """
                SELECT event_type, violation_severity, count(*) as count 
                FROM proctoring_snapshots 
                GROUP BY event_type, violation_severity
            """
            proctor_df = self.fetch_data(proctor_query)
            if not proctor_df.empty:
                st.dataframe(proctor_df)
            else:
                st.info("No proctoring violations recorded in database snapshots.")
        except Exception as e:
            st.error(f"Error fetching proctoring metrics: {str(e)}")

if __name__ == "__main__":
    app = IntelliHireStreamlitApp()
    app.run()
