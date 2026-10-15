pipeline {
    agent any

    environment {
        IMAGE = 'YOUR_DOCKERHUB_USER/parking-app'   // <-- change this
        TAG   = "${env.BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps { checkout scm }
        }

        stage('Build and Test') {
            steps {
                sh 'npm ci'
                sh 'npm test'
            }
        }

        stage('Docker Build') {
            steps {
                // Compiles main.cpp inside the image, so the host needs no g++
                sh 'docker build -t $IMAGE:$TAG -t $IMAGE:latest .'
            }
        }

        stage('Push Image') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub-creds',
                                                  usernameVariable: 'DH_USER',
                                                  passwordVariable: 'DH_PASS')]) {
                    sh 'echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin'
                    sh 'docker push $IMAGE:$TAG'
                    sh 'docker push $IMAGE:latest'
                }
            }
        }

        stage('Minikube Deployment') {
            steps {
                sh 'kubectl apply -f k8s/'
                sh 'kubectl set image deployment/parking-app parking-app=$IMAGE:$TAG'
                sh 'kubectl rollout status deployment/parking-app --timeout=120s'
            }
        }

        stage('Verification') {
            steps {
                sh 'kubectl get pods,deployment,svc'
                sh 'curl -fsS --retry 5 --retry-delay 3 http://$(minikube ip):30080/api/health'
            }
        }
    }

    post {
        always { sh 'docker logout || true' }
    }
}
