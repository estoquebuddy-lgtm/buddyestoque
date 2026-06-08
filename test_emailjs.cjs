async function test() {
  console.log("Testing EmailJS REST API...");
  const payload = {
    service_id: "service_q5nfjuk",
    template_id: "template_i77h8pk",
    user_id: "uUAL8xHI-jKaqRpuy",
    template_params: {
      email_destino: "eng.luanvasconcelos@gmail.com",
      to_email: "eng.luanvasconcelos@gmail.com",
      usuario_destino: "Luan Vasconcelos",
      to_name: "Luan Vasconcelos",
      obra_nome: "Casa N&J - Preá, Ceará",
      prioridade: "NORMAL",
      material_detalhes: "Teste de envio via API",
      data_entrega: "08/06/2026",
      usuario_remetente: "Luan",
      from_name: "Luan"
    }
  };

  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const status = res.status;
    const text = await res.text();
    console.log(`Status: ${status}`);
    console.log(`Response: ${text}`);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

test();
