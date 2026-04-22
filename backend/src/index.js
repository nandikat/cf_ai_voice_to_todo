const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

export default {
	async fetch(request, env, ctx) {
		if (request.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders });
		}
		if (request.method === "POST" && new URL(request.url).pathname === "/api/process") {
			try {
				const formData = await request.formData();
				const audioFile = formData.get("audio");
				if (!audioFile) throw new Error("No audio file provided");

				const audioArrayBuffer = await audioFile.arrayBuffer();
				const audioBytes = [...new Uint8Array(audioArrayBuffer)];
				const transcription = await env.AI.run("@cf/openai/whisper", { audio: audioBytes });
				const transcriptText = transcription.text;
				const systemPrompt = `You are an AI assistant. Extract a list of distinct action items or tasks from the following transcript. Respond ONLY with a valid JSON array of strings. Do not include markdown formatting, backticks, or conversational text. Transcript: "${transcriptText}"`;
				const llamaResponse = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
					messages: [{ role: "user", content: systemPrompt }]
				});
				let aiData = llamaResponse.response || llamaResponse.result || llamaResponse;
				let tasks = [];

				if (Array.isArray(aiData)) {
					tasks = aiData;
				} else if (typeof aiData === "string") {
					let rawResponse = aiData.replace(/```json/i, '').replace(/```/g, '').trim();
					if (rawResponse.length > 0) {
						tasks = JSON.parse(rawResponse);
					}
				} else {
					throw new Error("Llama returned an unrecognized format.");
				}
// ++++++++++++++++++++++++++++++++++++++++++++++++++++
				const noteInsert = await env.DB.prepare("INSERT INTO notes (transcript) VALUES (?) RETURNING id")
					.bind(transcriptText).first();
				const noteId = noteInsert?.id;
				if (noteId && tasks.length > 0) {
					const statements = tasks.map(task => 
						env.DB.prepare("INSERT INTO action_items (note_id, task) VALUES (?, ?)").bind(noteId, task)
					);
					await env.DB.batch(statements);
				}
				return new Response(JSON.stringify({ transcript: transcriptText, tasks }), {
					headers: { ...corsHeaders, "Content-Type": "application/json" }
				});

			} catch (error) {
				console.error("ERROR:+++++++++++++++++++++++++++++++++++++++++++++++++++++", error.stack || error); 
				return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
			}
		}
		if (request.method === "GET" && new URL(request.url).pathname === "/api/history") {
			try {
				const { results: notes } = await env.DB.prepare("SELECT * FROM notes ORDER BY created_at DESC").all();
				const { results: tasks } = await env.DB.prepare("SELECT * FROM action_items").all();
				const history = notes.map(note => {
					return {
						id: note.id,
						transcript: note.transcript,
						date: note.created_at,
						tasks: tasks.filter(t => t.note_id === note.id).map(t => t.task)
					};
				});
				return new Response(JSON.stringify(history), {
					headers: { ...corsHeaders, "Content-Type": "application/json" }
				});
			} catch (error) {
				console.error("ERROR:+++++++++++++++++++++++++++++++++++++++++++", error);
				return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
			}
		}
		return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });
	},
};