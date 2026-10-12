{
    description = "dim-world-builder: build worlds for simulated robots and export them for dimos sim2, as a dimOS Desktop app (`nix build .#dimosApp`)";
    # nixos-25.11's deno is 2.6.10, the version dimos pins for its cockpit
    inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    nixConfig = {
        extra-substituters = [ "https://dimos-desktop.cachix.org" ];
        extra-trusted-public-keys = [ "dimos-desktop.cachix.org-1:A4P35aGJGmCan92LWyamtSFXMqaVE+VRFYnrJ8QMTeQ=" ];
    };
    outputs = { self, nixpkgs }:
        let
            systems = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ];
            forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
            files = pkgs: paths: pkgs.lib.fileset.toSource { root = ./.; fileset = pkgs.lib.fileset.unions paths; };
            # the server's start line: deno for the server, uv for the cooker (it fetches its own CPython and the locked
            # wheels into the app's data folder on the first import, so nothing here is platform-specific but the binaries)
            serverLine = target: server: frontend: ''
                export PATH=${target.uv}/bin:$PATH
                exec ${target.deno}/bin/deno run -A --no-lock ${server}/backend/main.ts --frontend ${frontend} --uv ${target.uv}/bin/uv "$@"
            '';
            # bin/dimos-app-server for <arch> Linux, written on any machine: its bash, deno and uv are the target's
            linuxApp = pkgs: arch: server: frontend:
                let linux = nixpkgs.legacyPackages."${arch}-linux"; in
                pkgs.writeTextFile {
                    name = "dimos-app-server-${arch}-linux";
                    destination = "/bin/dimos-app-server";
                    executable = true;
                    text = "#!${linux.runtimeShell}\n${serverLine linux server frontend}\n";
                };
        in {
            packages = forAll (pkgs: rec {
                # the page: vite's build of src/ (plain JS once built, so one build serves every target)
                frontend = pkgs.buildNpmPackage {
                    pname = "dim-world-builder-frontend";
                    version = "0.1.0";
                    src = files pkgs [ ./package.json ./package-lock.json ./index.html ./vite.config.ts ./tsconfig.json ./src ];
                    # `nix build .#frontend` prints the right hash when package-lock.json changes
                    npmDepsHash = "sha256-4rCVN+vm/WcRllXSm+In8rQda7zmrdbcY/OAF1d38Ck=";
                    installPhase = "cp -r dist $out";
                };
                # the server and what it reads: the shared world model, the asset library, the cooker's locked project
                server = files pkgs [ ./backend ./src/world ./assets ./cooker/pyproject.toml ./cooker/uv.lock ./cooker/cook.py ./cooker/render_view.py ./cooker/check_clips.py ];
                dimosApp = pkgs.writeShellScriptBin "dimos-app-server" (serverLine pkgs server frontend);
                default = dimosApp;
                dimosApp-aarch64-linux = linuxApp pkgs "aarch64" server frontend;
                dimosApp-x86_64-linux = linuxApp pkgs "x86_64" server frontend;
            });
        };
}
