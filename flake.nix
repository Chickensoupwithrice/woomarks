{
  description = "woomarks development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            python3
            nodejs_20
            http-server
          ];

          shellHook = ''
            echo "🔖 woomarks development environment"
            echo ""
            echo "Available commands:"
            echo "  serve-python  - Start Python HTTP server on port 8000"
            echo "  serve-node    - Start Node.js HTTP server on port 3000" 
            echo "  serve-http    - Start http-server on port 8080"
            echo ""
            echo "Then open http://localhost:<port> in your browser"
            
            # Add convenience aliases
            alias serve-python="python3 -m http.server 8000"
            alias serve-node="npx http-server -p 3000 -c-1"
            alias serve-http="http-server -p 8080 -c-1"
          '';
        };
      });
}
