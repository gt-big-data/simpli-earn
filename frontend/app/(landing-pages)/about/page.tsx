import styles from './about.module.css';
import Image from "next/image";
import { Metadata } from "next";
import { FaLinkedin, FaGithub } from "react-icons/fa";
import Link from 'next/link';

export const metadata: Metadata = {
  title: "About Us | SimpliEarn",
};

const teamMembers = [
  {
    name: "Gauri Sharma",
    role: "Project Lead",
    description: "I'm a Computer Science student at Georgia Tech exploring how AI and language technologies can help us understand human and financial systems. My work combines NLP, social dynamics, finance, and AI safety to study how people communicate, make decisions, and build trust!",
    image: "/images/team_imgs/Gauri_Sharma.png",
    socials: {
      linkedin: "https://www.linkedin.com/in/gs-softwaredev/",
      github: "https://github.com/gauri-sharmaa/gauri-sharmaa",
    },
  },
  {
    name: "Ritwij Ghosh",
    role: "Project Lead",
    description: "I study Computer Science at Georgia Tech, concentrating on Machine Learning, Aritifical Intelligence, and Embedded Systems. I specialize in buiding AI solutions across industries such as manufacturing, consulting, and financial technology. I'm passionate about improving and facilitating people's lives through creative applications of cutting-edge technologies.",
    image: "/images/team_imgs/Ritwij_Ghosh.jpeg",
    socials: {
      linkedin: "http://www.linkedin.com/in/ritwij-ghosh",
      github: "https://github.com/ritwij-ghosh",
    },
  },
  {
    name: "Parth Parikh",
    role: "Sentiment Analysis",
    description: "I'm a first-year student studying Computer Science with concentrations in intelligence and theory. I'm passionate about real-world AI/ML applications and I'm interested in delving deeper into academic research. In my free time, I enjoy pursuing photography in parks and nature.",
    image: "/images/team_imgs/Parth_Parikh.jpg",
    socials: {
      linkedin: "https://www.linkedin.com/in/parthparikh04",
      github: "https://github.com/parthparikh04",
    },
  },
  {
    name: "Vidyut Rajagopal",
    role: "Data Visualization",
    description: "I'm a freshman at Georgia Tech and the co-founder of SimpliEarn. I have a strong interest in cybersecurity, cloud computing, and software development. I'm passionate about applying technology to real-world challenges—especially in finance, leadership, and client-facing domains. Outside of SimpliEarn, I enjoy producing music, publishing articles, and playing cricket.",
    image: "/images/team_imgs/Vidyut_Raj_1.png",
    socials: {
      linkedin: "https://www.linkedin.com/in/vidyut-rajagopal",
      github: "https://github.com/vidyutraj",
    },
  },
  {
    name: "Evelyn Chen",
    role: "Data Visualization",
    description: "I'm Evelyn (she/her), from Portland, OR. I love learning new things and enjoy using my creativity and technical programming skills to build full-stack applications. I’m also into rock climbing, hiking, catching sunrises/sunsets, running, crafting (birthday cards are so fun!), and taking too many pics on my digital camera.",
    image: "/images/team_imgs/Evelyn_Chen.jpg",
    socials: {
      linkedin: "https://www.linkedin.com/in/evelynchen5/",
      github: "https://github.com/itsevelync",
    },
  },
  {
    name: "Neil Samant",
    role: "RAG",
    description: "I'm a mathematics major at Georgia Tech with a concentration in data science and a minor in computer science. I'm passionate about using tech to solve real-world problems—whether that's through building full-stack web apps, diving into machine learning projects, or analyzing data. I'm also a National Master in chess and have been competing for over 10 years.",
    image: "/images/team_imgs/Neil_Samant.jpeg",
    socials: {
      linkedin: "https://www.linkedin.com/in/neil-samant",
      github: "https://github.com/neilsam19",
    },
  },
  {
    name: "Kate Li",
    role: "Data Visualization",
    description: "I'm a computer science major at Georgia Tech with a minor in Linguistics. I love exploring and learning new things, especially when I can use technology to solve real-world problems or chase whatever idea has currently hijacked my brain. I'm also in Film Club and a big foodie—let me know if you have movie or restaurant recommendations!",
    image: "/images/team_imgs/Kate_Li.png",
    socials: {
      linkedin: "https://www.linkedin.com/in/li-kate",
      github: "https://github.com/li-kate",
    },
  },
  {
    name: "Apramey Akkiraju",
    role: "Data Visualization",
    description: "I'm a computer science student passionate about fintech and the financial services industry. I joined SimpliEarn because its mission of making investing more accessible through earnings call analysis really resonated with me.",
    image: "/images/team_imgs/Apramey_Akkiraju.jpeg",
    socials: {
      linkedin: "https://www.linkedin.com/in/aprameyakkiraju/",
      github: "https://github.com/Apramey006",
    },
  },
  {
    name: "Soham Pati",
    role: "Full Stack",
    description: "I'm a second-year Computer Science student at Georgia Tech. In my free time, I enjoy golfing and playing the violin.",
    image: "/images/team_imgs/Soham_Pati.jpeg",
    socials: {
      linkedin: "https://www.linkedin.com/in/soham--pati/",
      github: "https://github.com/sohampati",
    },
  },
  {
    name: "Soungmin (Min) Lee",
    role: "Sentiment Analysis",
    description: "I'm a BS/MS student majoring in Computer Science at Georgia Tech. I specialize in NLP and full-stack development, and I'm enthusiastic about building software solutions that solve real-world problems.",
    image: "/images/team_imgs/Soungmin_Lee.png",
    socials: {
      linkedin: "https://www.linkedin.com/in/soung-min-lee/",
      github: "https://github.com/minovermax",
    },
  },
  {
    name: "Ethan Hu",
    role: "Sentiment Analysis",
    description: "I'm a first-year computer science student from the Greater Boston area. I'm interested in numbers, and I enjoy spending time outdoors and baking desserts.",
    image: "/images/team_imgs/Ethan_Hu.jpeg",
    socials: {
      linkedin: "https://www.linkedin.com/in/ethanhu89/",
      github: "https://github.com/ethanhu89",
    },
  },
  {
    name: "Zechariah Frierson",
    role: "Frontend",
    description: "I'm a freshman at Georgia Tech and part of the data visualization team for SimpliEarn. I love frontend web development, web design, and coding in general. Outside of programming, I enjoy playing soccer and volleyball and spending time with friends.",
    image: "/images/team_imgs/Zechariah_Frierson.jpg",
    socials: {
      linkedin: "https://www.linkedin.com/in/zechariah-frierson/",
      github: "https://github.com/techo10n",
    },
  },
  {
    name: "Elvis Li",
    role: "Sentiment Analysis",
    description: "I'm a junior at Georgia Tech studying Computer Science. I enjoy exploring how NLP and machine learning can uncover insights from financial data.",
    image: "/images/team_imgs/Elvis_Li.png",
    socials: {
      linkedin: "https://www.linkedin.com/in/elvis-li03",
      github: "https://github.com/Elmobile-Code/",
    },
  },
  {
    name: "Rithwik Sharma",
    role: "Sentiment Analysis",
    description: "I'm a Computer Engineering student at Georgia Tech, whose passionate about Machine Learning, NLP, Embedded Systems, and Monopoly.",
    image: "/images/team_imgs/Rithwik_Sharma.jpg",
    socials: {
      linkedin: "https://www.linkedin.com/in/rithwiksharma/",
      github: "https://github.com/RithwikSharma",
    },
  },
  {
    name: "Aadi Dash",
    role: "Sentiment Analysis",
    description: "I'm a first-year Computer Science major interested in ML, LLM fine-tuning, and statistics. Outside of school I like to play music, watch sports, and eat Chipotle.",
    image: "/images/team_imgs/Aadi_Dash.jpg",
    socials: {
      linkedin: "https://www.linkedin.com/in/aadidash/",
      github: "",
    },
  },
  {
    name: "Ashwin Vijayakumar",
    role: "RAG",
    description: "Freshman CS major interested in developing end-to-end full stack solutions using AI/ML technologies",
    image: "/images/team_imgs/Ashwin_Vijayakumar.png",
    socials: {
      linkedin: "https://www.linkedin.com/in/24ashwinv",
      github: "https://github.com/ashwinvijayakumar24",
    },
  },
  {
    name: "Guilherme Luvielmo",
    role: "Full Stack",
    description: "Computer Science student focused on AI, machine learning, and EdTech. I'm passionate about building education tools that can empower learning for underrepresented groups.",
    image: "/images/team_imgs/Guilherme_Luvielmo.jpg",
    socials: {
      linkedin: "https://www.linkedin.com/in/g-luvielmo/",
      github: "https://github.com/gluvielmo",
    },
  },
  {
    name: "Andrew Pang",
    role: "RAG",
    description: "I'm a first year CS major, and I have strong interests in Machine Learning, LLMs, and entrepreneurship. Outside of academics, I enjoy writing, playing tennis, and traveling.",
    image: "/images/team_imgs/Andrew_Pang.png",
    socials: {
      linkedin: "https://www.linkedin.com/in/andrew-pang87",
      github: "https://github.com/apbuilds",
    },
  },
  {
    name: "Sanjana Devarajan",
    role: "Full Stack",
    description: "I'm an Industrial and Systems Engineering major with a FinTech minor at Georgia Tech, interested in the intersection of mathematics, computer science, and financial markets. In my free time, I enjoy playing tennis.",
    image: "/images/team_imgs/Sanjana_Devarajan.jpg",
    socials: {
      linkedin: "https://www.linkedin.com/in/sanjana-devarajan-a86618267/",
      github: "",
    },
  },
];

export default function AboutUs() {
  return (
    <div className={styles.pageContainer}>
      
      <main className={styles.mainContent}>
        {/* Hero Section */}
        <section className={styles.heroSection}>
          <h1>About Us</h1>
            <p className={styles.heroText}>
              As individuals interested in finance, stock trading, and business, we want to develop a financial education platform that focuses on teaching technical terminology and business acumen through live analysis of quarterly earnings calls.
            </p>
            <p className={styles.heroText}>
              We hope that by using this frequent, real, and low-stakes situation, we can create a safe and productive environment to develop people&apos;s business intuition and financial knowledge.
            </p>
            <p className={styles.heroText}>
              We are under <a href="https://gtbigdatabigimpact.com/" className={styles.orgLink}>Big Data Big Impact</a>, a Georgia Tech Student Organization.
            </p>
        </section>

        {/* Team Section */}
        <section className={styles.teamSection}>
          <h2>Meet the Team</h2>
          <div className={styles.teamGrid}>
            {teamMembers.map((member, index) => (
              <div key={index} className={styles.teamCard}>
                {/* Profile image is currently a square. Might change to circle if preferred */}
                <div className={styles.profileImage}>
                  <Image 
                    src={member.image} 
                    alt={member.name} 
                    width={150}
                    height={150}
                  />
                </div>
                
                {/* Role/tags here instead? */}
                <h3>{member.name}</h3>
                <p className={styles.role}>{member.role}</p>
                <p className={styles.description}>{member.description}</p>
                {/* Social Icons - idk what images to use so there are none rn*/}
                <div className={styles.socialIcons}>
                  {member.socials.linkedin && (
                    <Link href={member.socials.linkedin} target="_blank" rel="noopener noreferrer">
                      <FaLinkedin />
                    </Link>
                  )}
                  {member.socials.github && (
                    <Link href={member.socials.github} target="_blank" rel="noopener noreferrer">
                      <FaGithub />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}