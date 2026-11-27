.section .rodata.rom_title_font,"a",@progbits
.global rom_title_font
rom_title_font:
.incbin "fonts/rom_names.bin"
