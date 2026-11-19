/*
  Conecta Comunidade — Nó IoT de sala (compatível com TinkerCad Circuits)

  Sensores:
    1. HC-SR04 (ultrassônico) instalado no batente da porta -> detecta passagens.
       Dois sensores lado a lado indicariam direção; no protótipo usamos 1 sensor
       + botão para indicar o sentido (simula o 2º sensor).
    2. TMP36 (temperatura) -> conforto/segurança da sala.

  Atuadores:
    - LED verde: sala com lugares | LED vermelho: lotação atingida
    - Buzzer: temperatura acima de 30 °C

  Ligações (Arduino Uno):
    HC-SR04  TRIG -> D9   ECHO -> D10   VCC -> 5V   GND -> GND
    TMP36    Vout -> A0   +Vs  -> 5V    GND -> GND
    Botão "saída" -> D2 (INPUT_PULLUP, outro terminal no GND)
    LED verde -> D5 (resistor 220R)   LED vermelho -> D6 (220R)   Buzzer -> D7

  Saída: uma linha JSON por evento na Serial (9600 baud), no MESMO formato
  aceito por POST /api/iot/leituras. Um gateway (PC/ESP32) lê a serial e
  encaminha para a API com o cabeçalho X-Device-Key.
*/

const char* SALA = "SALA-A";
const int CAPACIDADE = 30;

const int PIN_TRIG = 9, PIN_ECHO = 10, PIN_TEMP = A0;
const int PIN_BOTAO_SAIDA = 2, PIN_LED_VERDE = 5, PIN_LED_VERMELHO = 6, PIN_BUZZER = 7;

const int DISTANCIA_PASSAGEM_CM = 60;          // algo a menos de 60 cm = pessoa passando
const unsigned long INTERVALO_TEMP_MS = 10000; // envia temperatura a cada 10 s
const float LIMITE_TEMP = 30.0;

int ocupacao = 0;
bool objetoPresente = false;
unsigned long ultimoEnvioTemp = 0;

long medirDistanciaCm() {
  digitalWrite(PIN_TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long duracao = pulseIn(PIN_ECHO, HIGH, 30000); // timeout 30 ms
  if (duracao == 0) return 999;
  return duracao * 0.034 / 2;
}

float lerTemperaturaC() {
  int leitura = analogRead(PIN_TEMP);
  float tensao = leitura * 5.0 / 1024.0;
  return (tensao - 0.5) * 100.0; // TMP36: 10 mV/°C com offset de 500 mV
}

void enviarFluxo(const char* evento) {
  Serial.print("{\"sala\":\""); Serial.print(SALA);
  Serial.print("\",\"sensor\":\"fluxo\",\"evento\":\""); Serial.print(evento);
  Serial.print("\",\"ocupacaoLocal\":"); Serial.print(ocupacao);
  Serial.println("}");
}

void enviarTemperatura(float t) {
  Serial.print("{\"sala\":\""); Serial.print(SALA);
  Serial.print("\",\"sensor\":\"temperatura\",\"valor\":"); Serial.print(t, 1);
  Serial.println("}");
}

void atualizarAtuadores(float temp) {
  bool lotada = ocupacao >= CAPACIDADE;
  digitalWrite(PIN_LED_VERDE, lotada ? LOW : HIGH);
  digitalWrite(PIN_LED_VERMELHO, lotada ? HIGH : LOW);
  if (temp > LIMITE_TEMP) tone(PIN_BUZZER, 1000, 200); else noTone(PIN_BUZZER);
}

void setup() {
  Serial.begin(9600);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_BOTAO_SAIDA, INPUT_PULLUP);
  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_VERMELHO, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
}

void loop() {
  long distancia = medirDistanciaCm();
  bool presente = distancia < DISTANCIA_PASSAGEM_CM;

  // Borda de subida: alguém começou a passar pela porta
  if (presente && !objetoPresente) {
    bool saindo = digitalRead(PIN_BOTAO_SAIDA) == LOW;
    if (saindo) { if (ocupacao > 0) ocupacao--; enviarFluxo("saida"); }
    else        { ocupacao++;                   enviarFluxo("entrada"); }
  }
  objetoPresente = presente;

  float temp = lerTemperaturaC();
  if (millis() - ultimoEnvioTemp >= INTERVALO_TEMP_MS) {
    enviarTemperatura(temp);
    ultimoEnvioTemp = millis();
  }

  atualizarAtuadores(temp);
  delay(100);
}
