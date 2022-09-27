const isInViewport = (element) => {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= -60 &&
        rect.top <= (window.innerHeight || document.documentElement.clientHeight)
    );
}

const arrowClicked = () => {
    const blocks = document.getElementById("main").children
    for (var i = 0; i < blocks.length; i++) {
        if (isInViewport(blocks[i])) {
            if (i + 1 < blocks.length) {
                blocks[i + 1].scrollIntoView({ block: 'start', behavior: 'smooth' });
            } else {
                blocks[0].scrollIntoView({ block: 'start', behavior: 'smooth' });

            }
        }
    };
}

const scrollText = (() => {
    const canvas = document.getElementById("supernihilCanvas");

    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d");

    let index = 0;
    let text = "SUPERNIHILJOHANNESGÅRDSTEDVALBJØRN"
    let colors = ["#111111", "#49D292", "#49D292"];
    ctx.fillStyle = colors[1];

    return () => {
        for (let i = 0; i < 150; i++) {
            let randomNumber = Math.random()
            let size = Math.floor(randomNumber*10+10)
            ctx.font = `${size}px monospace`;

            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            let x = Math.floor(randomNumber * 300/8)*8
            let y = Math.floor(Math.random() * window.innerHeight / 11) * 11
            ctx.fillText(text[index], x, y);
            index = (index + 1) % text.length;
        }


        setTimeout(scrollText, 50);
    };
})()

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(scrollText, 50)


});