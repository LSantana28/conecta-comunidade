// Pipeline alternativo para Jenkins (mesmas etapas do GitHub Actions)
pipeline {
  agent any
  environment {
    IMAGEM = "conecta-comunidade:${env.BUILD_NUMBER}"
  }
  stages {
    stage('Checkout') {
      steps { checkout scm }
    }
    stage('Testes') {
      agent { docker { image 'node:22-alpine' } }
      steps { sh 'npm run test:ci' }
      post { always { junit 'test-results.xml' } }
    }
    stage('Build Docker') {
      steps { sh 'docker build -t $IMAGEM .' }
    }
    stage('Smoke test') {
      steps {
        sh '''
          docker rm -f conecta-ci || true
          docker run -d --name conecta-ci -p 3100:3000 $IMAGEM
          sleep 5
          docker run --rm --network host -e BASE_URL=http://localhost:3100 $IMAGEM node scripts/smoke.js
        '''
      }
    }
  }
  post {
    always { sh 'docker rm -f conecta-ci || true' }
  }
}
