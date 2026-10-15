pipeline {
    agent any

    environment {
        NODE_ENV     = 'test'
        PYTHONPATH   = 'server_py'
        JWT_SECRET   = 'ci-secret-key-for-testing-purposes-only-1234567890'
        DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/intellihire'
        // CI=true makes Playwright start (and stop) its own backend + client
        // web servers instead of reusing whatever happens to be on the agent,
        // and enables retries + the JUnit reporter.
        CI           = 'true'
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timestamps()
    }

    stages {
        stage('Checkout & Git Metadata') {
            steps {
                echo "========================================================="
                echo "  INTELLIHIRE CI/CD PIPELINE - JENKINS"
                echo "  Branch     : ${env.GIT_BRANCH ?: env.BRANCH_NAME ?: 'main'}"
                echo "  Commit ID  : ${env.GIT_COMMIT ?: 'LATEST'}"
                echo "  Build No   : #${env.BUILD_NUMBER}"
                echo "  Workspace  : ${env.WORKSPACE}"
                echo "========================================================="
                checkout scm
            }
        }

        stage('Install Dependencies') {
            parallel {
                stage('Client Dependencies') {
                    steps {
                        echo "--- Installing Client Dependencies ---"
                        script {
                            if (isUnix()) {
                                sh 'npm --prefix client install'
                            } else {
                                bat 'npm --prefix client install'
                            }
                        }
                    }
                }
                stage('Backend Dependencies') {
                    steps {
                        echo "--- Installing Python Backend Dependencies ---"
                        script {
                            if (isUnix()) {
                                sh 'python3 -m pip install --upgrade pip && pip install -r server_py/requirements.txt'
                            } else {
                                bat 'python -m pip install --upgrade pip && pip install -r server_py/requirements.txt'
                            }
                        }
                    }
                }
                stage('Root & Tooling') {
                    steps {
                        echo "--- Installing Root & Playwright Dependencies ---"
                        script {
                            if (isUnix()) {
                                sh 'npm install'
                            } else {
                                bat 'npm install'
                            }
                        }
                    }
                }
            }
        }

        stage('Client Lint, Types, Vitest & Build') {
            steps {
                echo "--- Linting, Type-Checking, Testing and Building the Client ---"
                script {
                    if (isUnix()) {
                        sh 'mkdir -p reports'
                        sh 'npm --prefix client run lint'
                        sh 'npm --prefix client run check'
                        sh 'npm --prefix client test -- --run --reporter=default --reporter=junit --outputFile=../reports/vitest.xml'
                        sh 'npm --prefix client run build'
                    } else {
                        bat 'if not exist reports mkdir reports'
                        bat 'npm --prefix client run lint'
                        bat 'npm --prefix client run check'
                        bat 'npm --prefix client test -- --run --reporter=default --reporter=junit --outputFile=../reports/vitest.xml'
                        bat 'npm --prefix client run build'
                    }
                }
            }
        }

        stage('FastAPI Backend Pytest, Coverage & Bandit Audit') {
            steps {
                echo "--- Executing Backend Unit & Security Tests ---"
                script {
                    if (isUnix()) {
                        sh 'mkdir -p reports'
                        sh 'python3 -m pytest server_py/tests --cov=server_py/app --cov-report=term-missing --cov-report=xml:reports/coverage.xml --junitxml=reports/pytest.xml --cov-fail-under=40'
                        sh 'bandit -q -r server_py/app -s B101,B104,B105 -ll'
                    } else {
                        bat 'if not exist reports mkdir reports'
                        bat 'python -m pytest server_py/tests --cov=server_py/app --cov-report=term-missing --cov-report=xml:reports/coverage.xml --junitxml=reports/pytest.xml --cov-fail-under=40'
                        bat 'bandit -q -r server_py/app -s B101,B104,B105 -ll'
                    }
                }
            }
        }

        stage('Dependency Vulnerability Audit') {
            steps {
                echo "--- Auditing npm Dependencies (production deps for the client) ---"
                script {
                    if (isUnix()) {
                        sh 'npm audit --audit-level=high'
                        sh 'npm --prefix client audit --omit=dev --audit-level=high'
                    } else {
                        bat 'npm audit --audit-level=high'
                        bat 'npm --prefix client audit --omit=dev --audit-level=high'
                    }
                }
            }
        }

        stage('API Contract Types Check') {
            steps {
                echo "--- Verifying generated TypeScript types match the FastAPI schema ---"
                script {
                    if (isUnix()) {
                        sh 'npm run gen:api-types'
                        sh 'git diff --exit-code client/src/lib/api-types.gen.ts'
                    } else {
                        bat 'npm run gen:api-types'
                        bat 'git diff --exit-code client/src/lib/api-types.gen.ts'
                    }
                }
            }
        }

        stage('Playwright E2E Suite') {
            steps {
                echo "--- Executing Full Playwright E2E Suite ---"
                script {
                    if (isUnix()) {
                        sh 'npx playwright install chromium'
                        sh 'npx playwright test'
                    } else {
                        bat 'npx playwright install chromium'
                        bat 'npx playwright test'
                    }
                }
            }
        }
    }

    post {
        always {
            junit allowEmptyResults: true, skipPublishingChecks: true, testResults: 'reports/*.xml, test-results/junit.xml'
            archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/**, test-results/**, playwright-report/**'
            echo "========================================================="
            echo "  Build #${env.BUILD_NUMBER} Completed on ${new Date().format('yyyy-MM-dd HH:mm:ss')}"
            echo "========================================================="
        }
        success {
            echo "SUCCESS: All stages passed successfully! Ready for deployment."
        }
        failure {
            echo "FAILURE: One or more stages failed. Please check the stage logs above."
        }
    }
}
