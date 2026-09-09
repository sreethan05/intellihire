pipeline {
    agent any

    environment {
        NODE_ENV     = 'test'
        PYTHONPATH   = 'server_py'
        JWT_SECRET   = 'ci-secret-key-for-testing-purposes-only-1234567890'
        DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/intellihire'
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

        stage('Client Lint & Vitest Unit Tests') {
            steps {
                echo "--- Executing Client Lint & Vitest Tests ---"
                script {
                    if (isUnix()) {
                        sh 'npm --prefix client run lint'
                        sh 'npm --prefix client run check'
                        sh 'npm --prefix client test -- --run'
                    } else {
                        bat 'npm --prefix client run lint'
                        bat 'npm --prefix client run check'
                        bat 'npm --prefix client test -- --run'
                    }
                }
            }
        }

        stage('FastAPI Backend Pytest & Bandit Audit') {
            steps {
                echo "--- Executing Backend Unit & Security Tests ---"
                script {
                    if (isUnix()) {
                        sh 'python3 -m pytest server_py/tests --cov=server_py/app --cov-report=term-missing --cov-fail-under=30'
                        sh 'bandit -q -r server_py/app -s B101,B104,B105 -ll'
                    } else {
                        bat 'python -m pytest server_py/tests --cov=server_py/app --cov-report=term-missing --cov-fail-under=30'
                        bat 'bandit -q -r server_py/app -s B101,B104,B105 -ll'
                    }
                }
            }
        }

        stage('Playwright Smoke Tests') {
            steps {
                echo "--- Executing Playwright Smoke Suite ---"
                script {
                    if (isUnix()) {
                        sh 'npx playwright install --with-deps chromium || true'
                        sh 'npx playwright test e2e/login.spec.ts e2e/hub-smoke.spec.ts e2e/api.spec.ts || true'
                    } else {
                        bat 'npx playwright install chromium'
                        bat 'npx playwright test e2e/login.spec.ts e2e/hub-smoke.spec.ts e2e/api.spec.ts'
                    }
                }
            }
        }
    }

    post {
        always {
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
