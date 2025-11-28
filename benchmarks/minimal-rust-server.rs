// Minimal Rust HTTP server - baseline for comparison
// This is what the POC should have looked like

use hyper::{Request, Response, body::Incoming};
use hyper_util::rt::TokioIo;
use http_body_util::Full;
use bytes::Bytes;
use tokio::net::TcpListener;

// Minimal handler - no allocations in hot path
async fn handle(_req: Request<Incoming>) -> Result<Response<Full<Bytes>>, std::convert::Infallible> {
    // Pre-allocated response bytes
    static RESPONSE: &[u8] = b"{\"message\":\"Hello World\"}";

    Ok(Response::builder()
        .status(200)
        .header("content-type", "application/json")
        .body(Full::new(Bytes::from_static(RESPONSE)))
        .unwrap())
}

#[tokio::main]
async fn main() {
    let listener = TcpListener::bind("0.0.0.0:3456").await.unwrap();
    println!("Minimal Rust server on :3456");

    loop {
        let (stream, _) = listener.accept().await.unwrap();
        let io = TokioIo::new(stream);

        tokio::spawn(async move {
            hyper::server::conn::http1::Builder::new()
                .serve_connection(io, hyper::service::service_fn(handle))
                .await
                .ok();
        });
    }
}
