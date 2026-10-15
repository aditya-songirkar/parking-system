pipeline {
    agent any

    environment {
        IMAGE = 'songirkar/parking-app'
        TAG = "${env.BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build and Test') {
            steps {
                sh 'npm ci'
                sh 'npm test'
            }
        }

        stage('Docker Build') {
            steps {
                sh 'docker build -t $IMAGE:$TAG -t $IMAGE:latest .'
            }
        }

        stage('Push Image') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DH_USER',
                    passwordVariable: 'DH_PASS'
                )]) {
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
                sh 'kubectl get pods,deployments,services'
                sh 'curl -fsS --retry 5 --retry-delay 3 http://$(kubectl get nodes -o jsonpath="{.items[0].status.addresses[0].address}"):30080/api/health'
            }
        }
    }

    post {
        always {
            sh 'docker logout || true'
        }
    }
}
