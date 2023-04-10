use std::io::Result;
fn main() -> Result<()> {
    let mut configured = prost_build::Config::new();
    configured.protoc_arg("--experimental_allow_proto3_optional");
    configured.compile_protos(&["src/protos/document.proto"], &["src/protos"])?;
    Ok(())
}
