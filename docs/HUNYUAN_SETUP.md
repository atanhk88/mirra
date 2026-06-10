# Hunyuan3D worker setup

Mirra's 3D generation is powered by a self-hosted [Hunyuan3D-2](https://github.com/Tencent-Hunyuan/Hunyuan3D-2)
worker — free and open source. The app talks to the worker's `api_server.py` HTTP API:

- `POST {worker}/send` with `{ "image": "<base64>", "texture": true }` → `{ "uid": "..." }`
- `GET {worker}/status/{uid}` → `processing` / `texturing` / `completed` (with `model_base64`) / `error`

You need an NVIDIA GPU with **~6 GB+ VRAM** (more for texturing). Two ways to run it:

## Option A — local GPU

```bash
git clone https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git
cd Hunyuan3D-2
pip install -r requirements.txt
# texture pipeline extras
cd hy3dgen/texgen/custom_rasterizer && pip install -e . && cd -
cd hy3dgen/texgen/differentiable_renderer && pip install -e . && cd -

python api_server.py --host 0.0.0.0 --port 8081
```

Then either:

- set `HUNYUAN_SERVER_URL=http://localhost:8081` in `.env.local`, or
- paste `http://localhost:8081` into the **Worker URL override** field in step 1 of the app.

## Option B — Google Colab (free GPU)

1. Open a Colab notebook with a GPU runtime (T4 works for shape; texturing is slow but works).
2. In cells:

   ```bash
   !git clone https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git
   %cd Hunyuan3D-2
   !pip install -r requirements.txt
   !cd hy3dgen/texgen/custom_rasterizer && pip install -e .
   !cd hy3dgen/texgen/differentiable_renderer && pip install -e .
   ```

3. Expose the port with a tunnel (cloudflared needs no account):

   ```bash
   !wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
   !chmod +x cloudflared
   ```

4. Start the server and the tunnel:

   ```python
   import subprocess
   server = subprocess.Popen(["python", "api_server.py", "--host", "0.0.0.0", "--port", "8081"])
   tunnel = subprocess.Popen(["./cloudflared", "tunnel", "--url", "http://localhost:8081"],
                             stderr=subprocess.PIPE, text=True)
   for line in tunnel.stderr:
       if "trycloudflare.com" in line:
           print(line)  # your public worker URL
           break
   ```

5. Copy the printed `https://….trycloudflare.com` URL and paste it into the **Worker URL
   override** field in Mirra's step 1. The tunnel URL changes every Colab session — just paste the
   new one next time; nothing is stored.

## Tips

- First generation downloads multi-GB model weights — expect a long first run.
- A full shape + texture job typically takes 30–120 seconds of GPU time.
- Keep the worker private if you can; anyone with the URL can submit jobs.
- If `GET /status/{uid}` returns `completed` without `model_base64`, update the repo — older
  `api_server.py` revisions used a different completion payload.
