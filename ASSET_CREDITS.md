# Asset credits

Cone geometry and `ConePaintTexture.dds` originate from **Mike Ferchak / schmerchak**, [nats-mod](https://github.com/schmerchak/nats-mod), commit `1742a96633537278dfc4f647a984e45fed8de647`, file `lincoln_2021_course.kn5`.

The Padwork project owner confirmed permission to redistribute these assets on September 24, 2026. The upstream repository has no published license; this attribution does not grant blanket reuse permission to other projects.

Adaptations in Padwork: extraction of upright/pointer templates from combined course meshes, removal of course positions and headings, uniform scaling to an 18-inch upright cone, conversion of the original DDS texture to PNG, and subtle per-object brightness variation. Original UVs and normals are retained.

The Lincoln east-apron aerial texture receives a darker concrete finish, and a separate concrete surface with generated grain is embedded in the venue model for both the browser and AC export. The color and grain use [2026 SCCA Solo Nationals East footage](https://www.youtube.com/watch?v=eUiUFwDX2AI) as visual reference. The reference video is not bundled with the project; the venue geometry and surrounding aerial site detail remain from nats-mod.

The same attribution is included as `ASSET_CREDITS.txt` in generated track source packages. The imported Lincoln venue also uses all nine shared model files listed with their SHA-256 digests in `src/assets/venue.json`. Their geometry and textures are converted to glTF, textures resized for the web, and source shaders approximated. No source course cones or timing layouts are included with the venue.
